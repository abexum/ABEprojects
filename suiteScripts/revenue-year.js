define([
    "N/search",
    "N/url",
    "N/task",
    "N/format",
    "N/ui/serverWidget",
    "N/record",
    "N/log",
    "N/runtime",
    "../sales-forecast/FCUtil"
], function (s, url, task, format, ui, record, log, runtime, FCUtil) {

    /**
     * Revenue Year Suitelet: Improved yearly revenue forecaster for ACBM
     *
     * @exports revenue-year
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/url
     * @requires N/task
     * @requires N/format
     * @requires N/ui/serverWidget
     * @requires N/record
     * @requires N/log
     *
     * @NApiVersion 2.1
     * @NModuleScope SameAccount
     * @NScriptType Suitelet
     */
    const exports = {};

    /**
     * <code>onRequest</code> event handler
     *
     * @param context
     *        {Object}
     * @param context.request
     *        {ServerRequest} The incoming request object
     * @param context.response
     *        {ServerResponse} The outgoing response object
     *
     * @return {void}
     *
     * @static
     * @function onRequest
     */

    const colFields = [
        {
            id: 'custrecord_rev_year_advertiser',
            label: 'Primary Advertiser',
            type: ui.FieldType.TEXT
        },
        {
            id: 'custrecord_rev_three_year_total',
            label: 'Three Year Sales',
            type: ui.FieldType.CURRENCY
        },
        { 
            id: 'custrecord_rev_booked_total',
            label: 'Booked',
            type: ui.FieldType.CURRENCY
        },
        { 
            id: 'custrecord_rev_pitch_total',
            label: 'Pitch',
            type: ui.FieldType.CURRENCY
        },
        { 
            id: 'custrecord_rev_year_perc_legacy_print',
            label: 'Legacy Print',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'custrecord_rev_year_perc_legacy_digital',
            label: 'Legacy Digital',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'custrecord_rev_year_perc_demand_gen',
            label: 'Demand Gen',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'custrecord_rev_year_perc_events',
            label: 'Events',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'custrecord_rev_year_perc_marketing_serv',
            label: 'Marketing Services',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'custrecord_rev_year_perc_marketplace',
            label: 'Marketplace',
            type: ui.FieldType.PERCENT
        }
    ];

    const additionalFields = [
        { 
            id: 'reviewbox',
            label: 'Reviewed',
            type: ui.FieldType.CHECKBOX
        },
        {
            id: 'scriptid',
            label: 'revenue forecast record',
            type: ui.FieldType.INTEGER
        }
    ];

    var editedFields = [];
    var runTheQuotaUpdateTask = true;
    const adminTask = () => FCUtil.adminTask();

    const advertiserList = [];
    const calcs = {};

    var salesrepResultList = [];

    function onRequest(context) {
        log.audit({title: 'Loading Revenue Suitelet...'});
        log.debug({title: 'request parameters', details: context.request.parameters});

        let displayTitle = 'Revenue Year';
        // if (adminUser()) displayTitle = 'Sales Forecast & Order Fulfillment';
        // if (fulfillmentUser()) displayTitle = 'Order Fulfillment';
        // if (salesRepUser()) displayTitle = 'Sales Forecast';

        const page = ui.createForm({
            title: displayTitle
        });
        
        let filter = getFilter(context.request);

        // keep quotas up to date when tool is first opened
        // if (runTheQuotaUpdateTask && adminTask()) refreshQuotaResults();

        filterOptionsSection(page, filter);

        page.clientScriptModulePath = "./revenue-year-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Update Filters',
            functionName: 'performSearch'
        });

        fillYearRecords(filter);

        log.debug({title: 'advertiserList', details: JSON.stringify(advertiserList)});

        // const quota = getQuotaCSVtotal(filter); // TODO replace with search for quota given rep, prop, month
        
        renderList(page);
        
        // calcSection(page, quota);

        context.response.writePage({
            pageObject: page
        });
    }

    function filterOptionsSection(page, filter) {
        const filtergroup = page.addFieldGroup({
            id : 'custpage_filtergroup',
            label : 'Filter Results'
        });
        filtergroup.isBorderHidden = true;

        const salesRepSearchField = page.addField({
            id: 'custpage_salesrep',
            label: 'Sales Rep',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        salesrepResultList = FCUtil.getSalesReps(salesRepSearchField, filter.salesrep, true);

        if (!filter.salesrep) {
            const user = runtime.getCurrentUser();
            const userId = user.id;
            const isSalesRep = (salesrepResultList.map(sr => sr.id).includes(userId));

            filter.salesrep = isSalesRep ? userId : salesrepResultList[0].id;
            if (isSalesRep) salesRepSearchField.defaultValue = userId;
        }

        const yearField = page.addField({
            id: 'custpage_year',
            label: 'Year',
            type: ui.FieldType.TEXT,
            container: 'custpage_filtergroup'
        });

        let year = parseInt(filter.year) || 0;
        if (!year) {
            const today = new Date();
            year = parseInt(today.getFullYear());
            if (today.getMonth() > 9) year++; // do next year if november +
        }
        yearField.defaultValue = year;
    }

    function calcSection(page, quota) {
        page.addFieldGroup({
            id : 'custpage_calcsgroup',
            label : 'Revenue Calcs'
        });

        let totalSales = 0;
        let totalProjected = 0;
        for (let group in calcs) {
            totalSales += calcs[group].sold;
            if (isNaN(calcs[group].projected)) continue;
            totalProjected += calcs[group].projected;
        }

        const soldField = page.addField({
            id: 'custpage_sold',
            label: 'Sold',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        soldField.defaultValue = totalSales.toFixed(2);
        soldField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const projectedField = page.addField({
            id: 'custpage_projected',
            label: 'Projected',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        projectedField.defaultValue = totalProjected.toFixed(2);
        projectedField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const quotaField = page.addField({
            id: 'custpage_quota',
            label: 'Quota',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        quotaField.defaultValue = quota;
        quotaField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        quotaField.updateBreakType({
            breakType : ui.FieldBreakType.STARTCOL
        });

        const bookedField = page.addField({
            id: 'custpage_booked',
            label: 'Booked %',
            type: ui.FieldType.PERCENT,
            container: 'custpage_calcsgroup'
        });
        if (quota) bookedField.defaultValue = ((totalSales/quota)*100).toFixed(2);

        bookedField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
    }

    function incrementCalcs(sold, forecasted, projected, type) {
        sold = parseFloat(sold);
        forecasted = parseFloat(forecasted);
        projected = parseFloat(projected);
        if (!isNaN(sold)) calcs[type].sold += sold;
        if (!isNaN(forecasted)) calcs[type].forecasted += forecasted;
        if (!isNaN(projected)) calcs[type].projected += projected;
    };

    // search the year records and join to the customer record
    // add empty index for matching salesrep
    function fillYearRecords(filter) {
        let { salesrep, year } = filter;
        // TODO check this getter for year
        year = parseInt(year) || 0;
        if (!year) {
            const today = new Date();
            year = parseInt(today.getFullYear());
            if (today.getMonth() > 9) year++; // do next year if november +
        }

        const searchFilter = [];

        const repFilter = s.createFilter({
            name: 'salesrep',
            operator: s.Operator.IS,
            values: salesrep,
            join: 'custrecord_rev_year_advertiser'
        });
        searchFilter.push(repFilter);
        const yrFilter = s.createFilter({
            name: 'custrecord_rev_year',
            operator: s.Operator.EQUALTO,
            values: year
        });
        searchFilter.push(yrFilter)

        const searchColumns = [];
        colFields.forEach(col => {
            let searchCol = s.createColumn({name: col.id});
            searchColumns.push(searchCol);
        });
        s.create({
            type: 'customrecord_revenue_year',
            columns: searchColumns,
            filters: searchFilter
        }).run().each(res => {
            let advertiserEntry = {
                advertiser: res.getValue({name: 'custrecord_rev_year_advertiser'}),
                advertiserName: res.getText({name: 'custrecord_rev_year_advertiser'}),
                recId: res.id
            };
            colFields.forEach(col =>{
                if (col.id === 'custrecord_rev_year_advertiser') return;
                advertiserEntry[col.id] = res.getValue({name: col.id});
            });
            advertiserList.push(advertiserEntry);
            return true;
        });
    }

    function getFilter(request) {
        const { salesrep, year, updatelogid } = request.parameters;

        if (updatelogid) {
            try {
                const updateLog = record.load({ type: 'customrecord_fcupdate_log', id: updatelogid});
                const editLog = updateLog.getValue({ fieldId: 'custrecord_fcupdate_editlog'});
                const editfields = updateLog.getValue({ fieldId: 'custrecord_fcupdate_editfields'});

                log.audit({title: 'Starting forecastTotals update task'});
                const updateTask = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    params: {custscript_fcupdate_editlog: editLog},
                    scriptId: 'customscript_fcupdate'
                });
                const taskId = updateTask.submit();
                log.audit({
                    title: 'update task ID',
                    details: taskId
                });

                editedFields = JSON.parse(editfields);
                log.debug({ title: 'editedFields', details: JSON.stringify(editedFields)});
                record.delete({ type: 'customrecord_fcupdate_log', id: updatelogid});
                log.audit({
                    title: 'Forecast Update Log deleted',
                    details: updatelogid
                });
            } catch(err) {
                // editlog record deletion should be caught, work has already been done
                // task failures do not need to interrupt workflow
                log.error({
                    title: err.name,
                    details: err.message
                });
            }
        }

        return {
            salesrep: salesrep,
            year: year
        }
    }

    function renderList(form) {

        // let advertiserResults = [];
        // Object.keys(advertiserIndex).forEach(adv => {
        //     let displayEntry = JSON.parse(JSON.stringify(advertiserIndex[adv]));
        //     displayEntry.advertiser = adv;
        //     displayEntry.advertiserName = advertiserIndex[adv].name;
        //     advertiserResults.push(displayEntry);
        // });

        // log.debug({title: 'advertiserResults', details: JSON.stringify(advertiserResults)});

        /* advertiserResults format
        {
            '1': [ // product group id
                {
                    'recId': 1, // id of revenue forecast record or null
                    'advertiser': 1, //clientId
                    'advertiserName': 'companyname'
                    'sold': 1000,
                    'forecasted': 1000,
                    'probability': 0.5,
                    'projected': 1500,
                    'threeyr': 5500
                } //,...
            ]
        }
        */

        const list = form.addSublist({
            id : 'custpage_year_advertisers',
            type : ui.SublistType.LIST,
            label : 'Year'
        });

        list.addButton({
            id : 'custpage_saveButton',
            label : 'Submit Reviewed',
            functionName: 'save'
        });

        colFields.concat(additionalFields).forEach(field => {
            let fieldObj = list.addField(field);
            // extras for input fields
            
            if (field.id == 'custrecord_rev_pitch_total' 
                || field.id.includes('_perc_')) {
                    fieldObj.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY});
            }
            if (field.id == 'scriptid') {
                fieldObj.updateDisplayType({displayType : ui.FieldDisplayType.HIDDEN});
            }
        });

        advertiserList.forEach((res, index) => {
            Object.keys(res).forEach(key => {
                let value = res[key];
                // if field was edited update with the new value rather than one found in search
                let fieldIndex = editedFields.findIndex(function(field) {
                    return (field.fieldId === key
                        && field.line === index
                    );
                });

                if (fieldIndex !== -1) value = editedFields[fieldIndex].value;

                if (key === 'recId') {
                    list.setSublistValue({
                        id: 'scriptid',
                        line: index,
                        value: value || 0
                    });
                    return;
                }

                if ((value || value == 0) && key !== 'advertiserName' && key !== 'recId') {
                    if (key === 'advertiser'){
                        const link = url.resolveRecord({
                            isEditMode: false,
                            recordId: value,
                            recordType: 'customer',
                        });
                        value = '<a href="'+link+'" target="_blank">'+res.advertiserName+'</a>';
                        list.setSublistValue({
                            id: 'custrecord_rev_year_' + key,
                            line: index,
                            value: value || 0
                        });
                    } else {
                        list.setSublistValue({
                            id: key,
                            line: index,
                            value: value || 0
                        });
                    }
                }
            });
        });

        return list;
    }

    function getQuotaCSVtotal(filter) {
        const quotaCSV = FCUtil.grabFile('quotaResults.csv');
        if (!quotaCSV) {
            refreshQuotaResults();
            return 0;
        }

        const lessInfo = (moreInfo) => {
            const { salesrep, property, date, amountmonthly } = moreInfo;
            const lessismore = { 
                salesrep: salesrep,
                property: property,
                date: date,
                amountmonthly: amountmonthly
            };
            return lessismore;
        };
        const csvObjs = FCUtil.processCSV(quotaCSV).map(obj => lessInfo(obj));

        const quotas = filterCSVlines(csvObjs, filter);

        // sum the remaining monthly amounts     
        const quotaTotal = quotas.reduce((total, current) => numOr0(total) + numOr0(current.amountmonthly), 0);

        return quotaTotal;
    }

    function filterCSVlines(csvObjs, filter) {
        let filtered = [];
        let { salesrep, year } = filter;
        const repName = FCUtil.getRepName(salesrep);

        year = parseInt(year) || 0;
        if (!year) {
            const today = new Date();
            year = parseInt(today.getFullYear());
        }

        csvObjs.forEach(line => {
            if (line.date) {
                const date = new Date(line.date);
                const hasYear = (year == date.getFullYear());
                if (hasYear) {
                    const hasRep = (repName && repName == line.salesrep);
                    if (hasRep) filtered.push(line);
                }
            }
        });
        return filtered;
    }

    function refreshQuotaResults() {
        log.audit({title: 'Refreshing Quota CSV...'});
        // SEARCH TO GET SAVED SEARCH INTERNAL ID FOR TASK
        let searchInternalId = '';
        s.create({
            type: s.Type.SAVED_SEARCH,
            filters: [],
            columns: ['id']
        }).run().each(res => {
            const resStr = JSON.stringify(res);
            const scriptid = JSON.parse(resStr).values.id;
            if (scriptid == 'customsearch_acbm_quota_search') {
                log.debug({title: 'quotaSearchScriptID', details: scriptid});
                log.debug({title: 'quotaSearchInternalID', details: res.id});
                searchInternalId = res.id;
                return false;
            }
            return true;
        });

        // SUBMIT TASK
        if (searchInternalId) {
            const quotaTask = task.create({taskType: task.TaskType.SEARCH});
            quotaTask.savedSearchId = searchInternalId;
            quotaTask.filePath = 'SuiteScripts/Suitelets/sales-forecast/quotaResults.csv';
            const quotaTaskId = quotaTask.submit();
            log.debug({title: 'quotaTaskId', details: quotaTaskId});
        } else {
            log.error({
                title: 'Quota Task Error',
                details: 'customsearch_acbm_quota_search not found, quotaResults.csv could not be built'
            })
        }
    }

    const numOr0 = n => isNaN(parseInt(n)) ? 0 : parseInt(n);

    exports.onRequest = onRequest;
    return exports;
});