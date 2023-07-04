define([
    "N/search",
    "N/record",
    "N/runtime",
    "N/log",
    "../sales-forecast/FCUtil"
], function (s, record, runtime, log, FCUtil) {

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

    const productGroups = [];
    // const productGroups = ['1','2','3','4','5','6'];

    const salesrepList = [];
    const propertyList = [];
    const advertiserCache = {};

    function execute(context) {
        log.audit({title: 'Running Revenue Forecast Backfill...'});

        const filter = getFilter(context.request);

        let groupListRecord = record.load({type: 'customlist', id: 703});

        const dupedRecord = JSON.parse(JSON.stringify(groupListRecord));
        log.debug({title: 'product group custom list record', details: JSON.stringify(dupedRecord.sublists.customvalue)});
        //groupListRecord.sublists.customvalue
        Object.keys(dupedRecord.sublists.customvalue).forEach(key => {
            if (dupedRecord.sublists.customvalue[key].isinactive == 'F') {
                log.debug({
                    title: 'search result col name in custom list', 
                    details: dupedRecord.sublists.customvalue[key].value
                });
                productGroups.push(dupedRecord.sublists.customvalue[key].valueid);
            }
        });
        log.debug({title: 'productGroups', details: productGroups});


        // add valid sales reps
        s.create({
            type: s.Type.EMPLOYEE,
            columns: ['issalesrep'],
            filters: [['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})) salesrepList.push(res.id);
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
    }



    function getFilter() {
        const startdate = runtime.getCurrentScript().getParameter({name: 'custscript_revbackfill_startdate'});
        const startValue = startdate || new Date();
        log.debug({title: 'get filter...'});
        return {
            startdate: startValue,
        }
    }

    const calcs = {};
    const defineCalc = (date, salesrep, property, advertiser, group) => {
        if (!salesrep || !property || !advertiser || !group) return 0;
        if (calcs[date] === undefined) calcs[date] = {};
        if (calcs[date][salesrep] === undefined) {
            log.debug({title: 'checking employee record : ' + salesrep});
            // let employeeRec = record.load({ type: record.Type.EMPLOYEE, id: salesrep});
            // if (employeeRec.getValue({ fieldId: 'isinactive'}) == 'T') return 0;
            // if (employeeRec.getValue({ fieldId: 'subsidiary'}) != '2') return 0;
            // if (employeeRec.getValue({ fieldId: 'issalesrep'}) != 'T') return 0;
            if (!salesrepList.includes(salesrep)) return 0;
            calcs[date][salesrep] = {};
        }
        if (calcs[date][salesrep][advertiser] === undefined) {
            // TODO
            // optional...  needs info : define a search of clients that have the given salesreps [salesrep]

            if (advertiserCache[advertiser] === undefined) {
                log.debug({title: 'loading client record : ' + advertiser});
                advertiserCache[advertiser] = {};
                let advRecord = record.load({type: record.Type.CUSTOMER, id: advertiser});
                // properties are on the client record in multi-value field [custentity4]
                let properties = advRecord.getValue({fieldId: 'custentity4'});
                log.debug({title: 'properties for client : ' + advertiser, details: properties});
    
                properties.forEach( p => {
                    if (!propertyList.includes(p)) return;
                    advertiserCache[advertiser][p] = {};
                    productGroups.forEach( g => {
                        advertiserCache[advertiser][p][g] = {};
                        advertiserCache[advertiser][p][g].sold = 0;
                    });
                });
            }

            calcs[date][salesrep][advertiser] = JSON.parse(JSON.stringify(advertiserCache[advertiser]));

        }
        if (calcs[date][salesrep][advertiser][property] === undefined) {
            if (!propertyList.includes(property)) return 0;
            calcs[date][salesrep][advertiser][property] = {};
        }
        if (calcs[date][salesrep][advertiser][property][group] === undefined) calcs[date][salesrep][advertiser][property][group] = {};

        const { sold } = calcs[date][salesrep][advertiser][property][group];
        if (!sold) calcs[date][salesrep][advertiser][property][group].sold = 0;

        const { noGroupSold } = calcs[date][salesrep][advertiser][property];
        if (!noGroupSold) calcs[date][salesrep][advertiser][property].sold = 0;

        return 1;
    }

    function fullRecordedSearch(filter) {
        log.debug({title: 'full record search...'});
        
        const incrementCalcs = (res, date) => {
            let salesrep = res.getValue({name: 'salesrep'});
            let property = res.getValue({name: 'class'});
            let advertiser = res.getValue({name: 'custbody_advertiser1'});
            let group = res.getValue({name: 'custitem_product_group', join: 'item'});
            let amount = res.getValue({name: 'amount'});
            let grossnum = parseFloat(amount);

            if (!grossnum) return;
            if (!defineCalc(date, salesrep, property, advertiser, group)) return;

            calcs[date][salesrep][advertiser][property].sold += grossnum; 
            calcs[date][salesrep][advertiser][property][group].sold += grossnum;            
        };

        FCUtil.dateIndexFourMonth(filter).forEach(dateObj => {
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

    function updateRecords() {

        const cleanupMode = 0;
        if (cleanupMode) {
            s.create({
                type: 'customrecord_revenue_forecast'
            }).run().each(res => {
                record.delete({type: 'customrecord_revenue_forecast', id: res.id});
                return true;
            });
        }

        Object.keys(calcs).forEach(dat => {
            let nsDate = FCUtil.getFirstOfMonthNsDateFromString(dat);
            log.debug({title: 'nsDATE', details: JSON.stringify(nsDate)});

            let month = dat.split('/')[0] - 1;
            let year = dat.split('/')[2];
            let dateObj = new Date(year, month, 1);

            Object.keys(calcs[dat]).forEach(rep => {
                Object.keys(calcs[dat][rep]).forEach(adv => {
                    Object.keys(calcs[dat][rep][adv]).forEach(prop => {

                        let filter = FCUtil.revSearchFilter(nsDate, rep, prop);
                        let advertiserFilter = s.createFilter({
                            name: 'custrecord_revenue_forecast_advertiser',
                            operator: s.Operator.ANYOF,
                            values: adv
                        });
                        filter.push(advertiserFilter);

                        let totalSoldAllGroups = calcs[dat][rep][adv][prop][grp].sold;

                        if (!cleanupMode) {

                            let noGroupFilter = s.createFilter({
                                name: 'custrecord_revenue_forecast_type',
                                operator: s.Operator.ISEMPTY,
                                values: adv
                            });

                            let allGroupsFilter = filter.concat(noGroupFilter);
                            let allGroupsRecord = null;
                            let allGroupsTotal = null;

                            s.create({
                                type: 'customrecord_revenue_forecast',
                                filters: allGroupsFilter,
                                columns: ['custrecord_revenue_forecast_sold']
                            }).run().each(res => {
                                allGroupsRecord = res.id;
                                allGroupsTotal = res.getValue({name: 'custrecord_revenue_forecast_sold'});
                                return false;
                            });
                        }

                        // UPDATE all groups record after looping through groups
                        Object.keys(calcs[dat][rep][adv][prop]).forEach(grp => {
                            
                            // log.debug({title: 'calcs value', details: JSON.stringify(calcs[dat][rep][adv][prop][grp])});

                            let totalSold = calcs[dat][rep][adv][prop][grp].sold;

                            let typeFilter = s.createFilter({
                                name: 'custrecord_revenue_forecast_type',
                                operator: s.Operator.ANYOF,
                                values: grp
                            });
                            filter.push(typeFilter);

                            let foundRecordId = null;
                            let foundTotal = null;

                            if (!cleanupMode) {
                                s.create({
                                    type: 'customrecord_revenue_forecast',
                                    filters: filter,
                                    columns: ['custrecord_revenue_forecast_sold']
                                }).run().each(res => {
                                    foundRecordId = res.id;
                                    foundTotal = res.getValue({name: 'custrecord_revenue_forecast_sold'});
                                    return false;
                                });
                            }

                            if (foundTotal === totalSold) return; // no need to update

                            let revRecord = (foundRecordId !== null)
                                ? record.load({type: 'customrecord_revenue_forecast', id: foundRecordId})
                                : record.create({type: 'customrecord_revenue_forecast'});

                            if (foundRecordId === null) {
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
                            }

                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_sold',
                                value: totalSold
                            });

                            // TODO optional : update overall record?

                            revRecord.save();
                            return;
                        });
                    // UPDATE all groups record
                    if (allGroupsTotal === totalSoldAllGroups) return;
                    let revRecordAllGroups = (allGroupsRecord !== null)
                        ? record.load({type: 'customrecord_revenue_forecast', id: allGroupsRecord})
                        : record.create({type: 'customrecord_revenue_forecast'});

                    if (allGroupsRecord === null) {
                        // log.debug({title: 'making new record...', details: dat + ' ' + rep + ' ' + prop + ' ' + adv + ' ' + grp + ' ' + totalSold});
                        
                        revRecordAllGroups.setValue({
                            fieldId: 'custrecord_revenue_forecast_date',
                            value: dateObj
                        });
                        revRecordAllGroups.setValue({
                            fieldId: 'custrecord_revenue_forecast_salesrep',
                            value: rep
                        });
                        revRecordAllGroups.setValue({
                            fieldId: 'custrecord_revenue_forecast_property',
                            value: prop
                        });
                        revRecordAllGroups.setValue({
                            fieldId: 'custrecord_revenue_forecast_advertiser',
                            value: adv
                        });
                    }

                    revRecordAllGroups.setValue({
                        fieldId: 'custrecord_revenue_forecast_sold',
                        value: totalSoldAllGroups
                    });

                    revRecordAllGroups.save();
                    return;

                    });
                });
            });
        });
    }

    exports.execute = execute;
    return exports;
});