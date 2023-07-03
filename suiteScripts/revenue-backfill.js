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

    function execute(context) {
        log.audit({title: 'Running Revenue Forecast Backfill...'});

        const filter = getFilter(context.request);
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
    const defineCalc = (date, salesrep, property, advertiser, group, adText, grpText) => {
        if (!salesrep || !property || !advertiser || !group) return 0;
        if (calcs[date] === undefined) calcs[date] = {};
        if (calcs[date][salesrep] === undefined) calcs[date][salesrep] = {};
        if (calcs[date][salesrep][property] === undefined) calcs[date][salesrep][property] = {};
        if (calcs[date][salesrep][property][advertiser] === undefined) calcs[date][salesrep][property][advertiser] = {};
        if (calcs[date][salesrep][property][advertiser][group] === undefined) calcs[date][salesrep][property][advertiser][group] = {};

        const { grpName, adName, sold } = calcs[date][salesrep][property][advertiser][group];
        if (!grpName) calcs[date][salesrep][property][advertiser][group].group = grpText;
        if (!adName) calcs[date][salesrep][property][advertiser][group].advertiser = adText;
        if (!sold) calcs[date][salesrep][property][advertiser][group].sold = 0;

        return 1;
    }

    //ABE TODO update this to reference id instead of strings for rep and property
    function fullRecordedSearch(filter) {
        log.debug({title: 'full record search...'});
        // calculate these values for each rep, prop, month while searching records
        // opportunity, estimate, salesorder, weighted, gross, universal
        const incrementCalcs = (res, date) => {
            let salesrep = res.getValue({name: 'salesrep'});
            let property = res.getValue({name: 'class'});
            let advertiser = res.getValue({name: 'custbody_advertiser1'});
            let group = res.getValue({name: 'custitem_product_group', join: 'item'});
            let amount = res.getValue({name: 'amount'});
            let grossnum = parseFloat(amount);
            let advertiserText =  res.getText({name: 'custbody_advertiser1'});
            let adName = advertiserText.substring(advertiserText.indexOf(' ')+1);
            let groupText =res.getText({name: 'custitem_product_group', join: 'item'});

            if (!grossnum) return;
            if (!defineCalc(date, salesrep, property, advertiser, group, adName, groupText)) return;

            calcs[date][salesrep][property][advertiser][group].sold += grossnum;            
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
                Object.keys(calcs[dat][rep]).forEach(prop => {

                    let filter = FCUtil.revSearchFilter(nsDate, rep, prop);

                    Object.keys(calcs[dat][rep][prop]).forEach(adv => {

                        const advertiserFilter = s.createFilter({
                            name: 'custrecord_revenue_forecast_advertiser',
                            operator: s.Operator.ANYOF,
                            values: adv
                        });
                        filter.push(advertiserFilter);

                        Object.keys(calcs[dat][rep][prop][adv]).forEach(grp => {
                            
                            // log.debug({title: 'calcs value', details: JSON.stringify(calcs[dat][rep][prop][adv][grp])});

                            let totalSold = calcs[dat][rep][prop][adv][grp].sold;
                            let adName = calcs[dat][rep][prop][adv][grp].adName;
                            let grpName = calcs[dat][rep][prop][adv][grp].grpName;

                            const typeFilter = s.createFilter({
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
                            } else {
                                log.debug({title: 'updating record...', details: dat + ' ' + rep + ' ' + prop + ' ' + adv + ' ' + grp + ' ' + totalSold});
                            }

                            revRecord.setValue({
                                fieldId: 'custrecord_revenue_forecast_sold',
                                value: totalSold
                            });

                            // log.debug({title: 'saving new record', details: JSON.stringify(revRecord)});

                            revRecord.save();
                            return;
                        });
                    });
                });
            });
        });
    }

    exports.execute = execute;
    return exports;
});