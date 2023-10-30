define([
    "N/search",
    "N/record",
    "N/runtime",
    "N/log",
    "N/task",
    "N/format",
    "../sales-forecast/FCUtil"
], function (s, record, runtime, log, task, format, FCUtil) {

    /**
     * Backfill task to populate Revenue Forecast custom records
     *
     * @exports revenue-backfill
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/file
     * @requires N/runtime
     * @requires N/task
     * @requires N/log
     *
     * @NApiVersion 2.1
     * @NModuleScope SameAccount
     * @NScriptType ScheduledScript
     */
    const exports = {};

    /**
     * <code>execute</code> event handler
     *
     * @governance 10,000
     *
     * @param context
     *        {Object}
     *
     * @return {void}
     *
     * @static
     * @function execute
     */

    const commonFields = [
        { id: 'salesrep' },
        { id: 'class' },
        { id: 'custbody_advertiser1' },
        { id: 'custitem_product_group', join: 'item' },
        { id: 'amount' }
    ];

    const typesDictionary = {
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields,
            searchFilter: 'SalesOrd'
        },
    };

    const salesrepList = [];
    const propertyList = [];
    const summaryLibrary = {};
    const backfillMonthTotal = 1;
    const cleanupMode = 0;

    function execute(context) {
        log.audit({title: 'Running Revenue Forecast Backfill...'});

        const filter = getFilter(context.request);

        // add valid sales reps
        s.create({
            type: s.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
        filters: [['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})) {
                // log.debug('adding salesrep', res.getValue({name: 'entityid'}));
                salesrepList.push(res.id);
            }
            return true;
        });

        // add valid properties
        s.create({
            type: s.Type.CLASSIFICATION,
            filters: [
                ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']], 'and',
                ['custrecord_parent_property_indicator', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            propertyList.push(res.id);
            return true;
        });

        fullRecordedSearch(filter);

        // rerun the task until a year is covered
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const nextBackfillDate = new Date(filter.startdate.getFullYear(), filter.startdate.getMonth() + backfillMonthTotal, 1);
        const timeDiffDays = Math.round((nextBackfillDate-firstOfMonth) / (1000*60*60*24));

        log.audit({
            title: 'time diff to next task in days',
            details: timeDiffDays
        });

        if (timeDiffDays < 365 && !cleanupMode) {
            const nsNextDate = format.format({value: nextBackfillDate, type: format.Type.DATE});
            const nextBackfillTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                params: {'custscript_revbackfill_startdate': nsNextDate},
                scriptId: 'customscript_revenue_backfill'
            });
            const taskId = nextBackfillTask.submit();
            log.audit({
                title: 'backlog task ID for ' + JSON.stringify(nsNextDate),
                details: taskId
            });
        }
    }


    function getFilter() {
        const startdate = runtime.getCurrentScript().getParameter({name: 'custscript_revbackfill_startdate'});
        const startValue = startdate || new Date();

        return {
            startdate: startValue,
        }
    }

    const calcs = {};
    const defineCalc = (date, salesrep, property, advertiser, group) => {
        if (!salesrep || !property || !advertiser || !group) return 0;
        if (calcs[date] === undefined) calcs[date] = {};
        if (calcs[date][salesrep] === undefined) {
            if (!salesrepList.includes(salesrep)) return 0;
            calcs[date][salesrep] = {};
        }
        if (calcs[date][salesrep][advertiser] === undefined) calcs[date][salesrep][advertiser] = {};
        if (calcs[date][salesrep][advertiser][property] === undefined) {
            if (!propertyList.includes(property)) return 0;
            calcs[date][salesrep][advertiser][property] = {};
        }
        if (calcs[date][salesrep][advertiser][property][group] === undefined) calcs[date][salesrep][advertiser][property][group] = {};

        const { sold } = calcs[date][salesrep][advertiser][property][group];
        if (!sold) calcs[date][salesrep][advertiser][property][group].sold = 0;

        return 1;
    }

    function fullRecordedSearch(filter) {
        const incrementCalcs = (res, date) => {
            let salesrep = res.getValue({name: 'salesrep'});
            let property = res.getValue({name: 'class'});
            let advertiser = res.getValue({name: 'custbody_advertiser1'});
            let group = res.getValue({name: 'custitem_product_group', join: 'item'});
            let amount = res.getValue({name: 'amount'});
            let grossnum = parseFloat(amount);

            if (!grossnum) return;
            if (!defineCalc(date, salesrep, property, advertiser, group)) return;

            calcs[date][salesrep][advertiser][property][group].sold += grossnum;            
        };

        FCUtil.dateIndex(filter, backfillMonthTotal).forEach(dateObj => {
            let { month, year } = dateObj;
            let dateStr = (month + 1)+'/1/'+year;
            let filters = {};

            Object.keys(typesDictionary).forEach(type => {
                filters[type] = FCUtil.searchFilter(
                    typesDictionary[type].searchFilter,
                    month,
                    year
                );
            });
            Object.keys(typesDictionary).forEach(type => {
                s.create({
                    type: s.Type.TRANSACTION,
                    filters: filters[type],
                    columns: typesDictionary[type].fields.map(op => {
                        if (op.join) {
                            return s.createColumn({ name: op.id, join: op.join });
                        }
                        return op.id;
                    })
                }).run().each(res => {
                    incrementCalcs(res, dateStr);
                    return true;
                });
            });  
        });
        updateRecords();
    }

    function checkNested(obj, level,  ...rest) {
        if (obj === undefined) return false
        if (rest.length == 0 && obj.hasOwnProperty(level)) return true
        return checkNested(obj[level], ...rest)
    }

    function updateRecords() {

        if (cleanupMode) {
            log.audit('Running in cleanup mode, will replace all existing data.');
            s.create({
                type: 'customrecord_revenue_forecast',
                columns: [
                    'custrecord_revenue_forecast_forecasted',
                    'custrecord_revenue_forecast_probability'
                ]
            }).run().each(res => {
                let resForecasted = res.getValue({name: 'custrecord_revenue_forecast_forecasted'});
                let resProb = res.getValue({name: 'custrecord_revenue_forecast_probability'});
                if (resForecasted === '.00' && resProb === '0.0%') {
                    log.debug({title: 'deleting forecast record', details: res.id});
                    record.delete({type: 'customrecord_revenue_forecast', id: res.id});
                }
                return true;
            });
            // cleanup mode just deletes records without salesrep input
            // running a backfill after can cause usage limit exceed
            return;
        }

        Object.keys(calcs).forEach(dat => {
            let nsDate = FCUtil.getFirstOfMonthNsDateFromString(dat);
            // log.debug({title: 'nsDATE', details: JSON.stringify(nsDate)});

            let month = dat.split('/')[0] - 1;
            let year = dat.split('/')[2];
            let dateObj = new Date(year, month, 1);

            // TODO loop through the existing records
            // update the sold to 0 if not found in calcs
            // update with sold from calcs if different
            // delete from the calcs index

            const datefilter = s.createFilter({
                name: 'custrecord_revenue_forecast_date',
                operator: s.Operator.ON,
                values: nsDate
            });

            s.create({
                type: 'customrecord_revenue_forecast',
                filters: datefilter,
                columns: [
                    'custrecord_revenue_forecast_sold',
                    'custrecord_revenue_forecast_salesrep',
                    'custrecord_revenue_forecast_property',
                    'custrecord_revenue_forecast_advertiser',
                    'custrecord_revenue_forecast_type'
                ]
            }).run().each(res => {
                let resTotal = res.getValue({name: 'custrecord_revenue_forecast_sold'});
                let resSalesrep = res.getValue({name: 'custrecord_revenue_forecast_salesrep'});
                let resProp = res.getValue({name: 'custrecord_revenue_forecast_property'});
                let resAdv = res.getValue({name: 'custrecord_revenue_forecast_advertiser'});
                let resGrp = res.getValue({name: 'custrecord_revenue_forecast_type'});

                // Update sold value if not matching calculated, set to zero if not found in calcs
                if (checkNested(calcs, dat, resSalesrep, resAdv, resProp, resGrp)) {
                    let calcSold = calcs[dat][resSalesrep][resAdv][resProp][resGrp].sold || 0;
                    if (calcSold !== resTotal) {
                        let resRecord = record.load({type: 'customrecord_revenue_forecast', id: res.id});
                        resRecord.setValue({
                            fieldId: 'custrecord_revenue_forecast_sold',
                            value: calcSold
                        });
                        if (!resRecord.getValue({fieldId: 'custrecord_rev_parent'})) adoptRecord(resRecord, resAdv, resProp);
                        resRecord.save();
                    }
                    // remove the calc so a new record will not be created in nested loops
                    delete calcs[dat][resSalesrep][resAdv][resProp][resGrp];
                } else {
                    let resRecordNoSales = record.load({type: 'customrecord_revenue_forecast', id: res.id});
                    resRecordNoSales.setValue({
                        fieldId: 'custrecord_revenue_forecast_sold',
                        value: 0
                    });
                    if (!resRecordNoSales.getValue({fieldId: 'custrecord_rev_parent'})) adoptRecord(resRecordNoSales, resAdv, resProp);
                    resRecordNoSales.save();
                }
                return true;
            });

            // Create new records as needed
            Object.keys(calcs[dat]).forEach(rep => {
                Object.keys(calcs[dat][rep]).forEach(adv => {
                    Object.keys(calcs[dat][rep][adv]).forEach(prop => {
                        Object.keys(calcs[dat][rep][adv][prop]).forEach(grp => {

                            let totalSold = calcs[dat][rep][adv][prop][grp].sold;

                            let revRecord = record.create({type: 'customrecord_revenue_forecast'});

                            // log.debug({title: 'making new record...', details: dat + ' ' + rep + ' ' + prop + ' ' + adv + ' ' + grp + ' ' + totalSold});
                            
                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_date',
                                value: dateObj
                            });
                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_salesrep',
                                value: rep
                            });
                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_property',
                                value: prop
                            });
                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_advertiser',
                                value: adv
                            });
                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_type',
                                value: grp
                            });

                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_sold',
                                value: totalSold
                            });

                            adoptRecord(revRecord, adv, prop, grp)

                            revRecord.save();
                            return;
                        });
                    });
                });
            });
        });

        function adoptRecord(childRecord, advertiser, property) {
            let parentRecord = findParent(advertiser, property);
            childRecord.setValue({                                
                fieldId: 'custrecord_rev_parent',
                value: parentRecord
            });
        }

        function findParent(advertiser, property) {
            // Use parent record id previously found and added to library
            if (summaryLibrary[advertiser] !== undefined 
                && summaryLibrary[advertiser][property]) {
                return summaryLibrary[advertiser][property];
            }

            // Find existing parent record
            let parentRecord = null;
            let parentFilter = [];
            const advFilter = s.createFilter({
                name: 'custrecord_rev_sum_primary_adv',
                operator: s.Operator.IS,
                values: advertiser
            });
            const propFilter = s.createFilter({
                name: 'custrecord_rev_sum_property',
                operator: s.Operator.IS,
                values: property
            });
            parentFilter.push(advFilter);
            parentFilter.push(propFilter);

            s.create({
                type:'customrecord_revenue_summary',
                filters: parentFilter
            }).run().each(res => {
                parentRecord = res.id;
                if (!summaryLibrary[advertiser]) summaryLibrary[advertiser] = {};
                summaryLibrary[advertiser][property] = res.id;
                return false;
            });

            if (parentRecord !== null) return parentRecord;

            // Create new parent record
            parentRecord = record.create({type:'customrecord_revenue_summary'});
            parentRecord.setValue({
                fieldId: 'custrecord_rev_sum_primary_adv',
                value: advertiser
            });
            parentRecord.setValue({
                fieldId: 'custrecord_rev_sum_property',
                value: property
            });
            let parentId = parentRecord.save();
            if (!summaryLibrary[advertiser]) summaryLibrary[advertiser] = {};
            summaryLibrary[advertiser][property] = parentId;
            return parentId;
        }
    }

    exports.execute = execute;
    return exports;
});