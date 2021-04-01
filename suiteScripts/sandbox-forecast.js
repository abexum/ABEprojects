define(["N/search", "N/url", "N/task", "N/file", "N/format", "N/record", "N/ui/serverWidget", "N/error", "N/log"], 
    function (s, url, task, file, format, record, ui, e, log) {

    /**
     * Forecast Suitelet: Display Search Results in a List
     *
     * @exports sandbox-forecast
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/url
     * @requires N/task
     * @requires N/record
     * @requires N/format
     * @requires N/ui/serverWidget
     * @requires N/error
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
     * @governance 0
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

    const commonFields = type => [
        { 
            id: 'salesrep',
            label: 'Sales Rep',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'class',
            label: 'Property',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'tranid',
            label: type+' #',
            type: ui.FieldType.TEXTAREA
        },
        { 
            id: 'trandate',
            label: 'Transaction Date',
            type: ui.FieldType.DATE
        },
        {
            id: 'custcol_agency_mf_flight_end_date',
            label: 'Flight End',
            type: ui.FieldType.DATE
        },
        { 
            id: 'custbody_advertiser1',
            label: 'Primary Advertiser',
            type: ui.FieldType.TEXT
        }
    ];
    const opportunityFields = [
        // { 
        //     id: 'entitystatus',
        //     label: 'Status',
        //     type: ui.FieldType.PASSWORD
        // },
        { 
            id: 'probability',
            label: 'Probability',
            type: ui.FieldType.PERCENT // make this inline editable > saves to record when user clicks save
        },
        // have forecast type be dropdown select as well
        { 
            id: 'amount',
            label: 'Gross',
            type: ui.FieldType.CURRENCY
        }
        // weighted, worst case, most likely, upside TODO
    ];
    const orderFields = [
        { 
            id: 'amount',
            label: 'Gross',
            type: ui.FieldType.CURRENCY
        }
    ];

    const repFiltered = filter => (filter.salesrep && filter.salesrep !== '0');
    const propFiltered = filter => (filter.property && filter.property !== '0');

    const typesDictionary = {
        opportunity: {
            id: 'tranid',
            label: 'Opportunities',
            fields: commonFields('Opportunity').concat(opportunityFields),
            searchFilter: ['Opprtnty']
        },
        estimate: {
            id: 'tranid',
            label: 'Proposals',
            fields: commonFields('Proposal').concat(opportunityFields),
            searchFilter: ['Estimate']
        },
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields('Order').concat(orderFields),
            searchFilter: ['SalesOrd']
        },
    };

    const calcs = {weighted: 0, gross: 0, universal: 0};

    function onRequest(context) {
        log.audit({title: 'Loading Forecast Suitelet...'});

        const page = ui.createForm({
            title: 'Forecast Suitelet'
        });

        const filter = getFilter(context.request);

        page.clientScriptModulePath = "./sandbox-forecast-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Perform Search',
            functionName: 'performSearch'
        });

        filterOptionsSection(page, filter);
        dateSection(page, filter);

        Object.keys(typesDictionary).forEach(key => {
            renderList(page, key, performSearch(key, filter), filter);
        });

        addQuota(page, filter);

        calcSection(page);

        context.response.writePage({
            pageObject: page
        });
    }

    function filterOptionsSection(page, filter) {
        const filtergroup = page.addFieldGroup({
            id : 'custpage_filtergroup',
            label : 'Filter Results'
        });
        filtergroup.isSingleColumn = true;
        filtergroup.isBorderHidden = true;

        const salesRepSearchField = page.addField({
            id: 'custpage_salesrep',
            label: 'Sales Rep',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getProperties(propertySearchField, filter.property);
    }

    function dateSection(page, filter) {
        const dategroup = page.addFieldGroup({
            id : 'custpage_dategroup',
            label : 'Select Dates'
        });
        dategroup.isBorderHidden = true;

        const startDateField = page.addField({
            id: 'custpage_startdate',
            label: 'Start Date',
            type: ui.FieldType.DATE,
            container: 'custpage_dategroup'
        });
        startDateField.defaultValue = filter.startdate;

        const endDateField = page.addField({
            id: 'custpage_enddate',
            label: 'End Date',
            type: ui.FieldType.DATE,
            container: 'custpage_dategroup'
        });
        endDateField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        endDateField.defaultValue = filter.enddate;
    }

    function calcSection(page) {
        page.addFieldGroup({
            id : 'custpage_calcsgroup',
            label : 'Forecast Calcs'
        });
        const weightedField = page.addField({
            id: 'custpage_calcweight',
            label: 'Weighted',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        weightedField.defaultValue = calcs.weighted;
        weightedField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const grossField = page.addField({
            id: 'custpage_calcgross',
            label: 'Gross',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        grossField.defaultValue = calcs.gross;
        grossField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const universalField = page.addField({
            id: 'custpage_calcuniversal',
            label: 'Universal',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        universalField.defaultValue = calcs.universal;
        universalField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
    }

    function getFilter(request) {
        const { salesrep, property, startdate, enddate } = request.parameters;

        const startValue = defaultStart(startdate);
        const endValue = defaultEnd(enddate);

        return {
            salesrep: salesrep,
            property: property,
            startdate: startValue,
            enddate: endValue
        }
    }

    function renderList(form, type, results, filter) {
        // calculate total gross amount
        const numOr0 = n => isNaN(parseInt(n)) ? 0 : parseInt(n);
        const grossTotal = results.reduce((total, current) => numOr0(total) + numOr0(current.amount), 0);
        const list = form.addSublist({
            id : 'custpage_' + type,
            type : ui.SublistType.LIST,
            label : typesDictionary[type].label + ' [' + grossTotal +']'
        });

        const skip = id => {
            return (repFiltered(filter) && id === 'salesrep') 
            || (propFiltered(filter) && id === 'class');
        };

        const columns = typesDictionary[type].fields;
        columns.forEach(id => {
            // remove columns searched for
            if (skip(id.id)) return;
            // insert forecast checkbox before tranid
            if (type !== 'salesorder' && id.id == 'tranid') {
                const forecast = list.addField({
                    id: 'custpage_forecast',
                    label: 'Forecast',
                    type: ui.FieldType.CHECKBOX,
                });
                forecast.defaultValue = (type === 'estimate') ? 'T' : 'F';
            }
            // add next column
            const field = list.addField(id);
            // extras for input fields
            // entity status would go here as dropdown if needed
            if (id.id === 'probability') {
                field.updateDisplayType({
                    displayType: ui.FieldDisplayType.ENTRY
                });
            }
        });
        if (type !== 'salesorder'){
            list.addField({
                id: 'custpage_weighted',
                label: 'Weighted',
                type: ui.FieldType.CURRENCY,
            });
        }

        results.forEach((res, index) => {
            Object.keys(res).forEach(key => {
                if (skip(key)) return;
                let value = res[key]
                if (value && key !== 'recordType' && key !== 'id') {
                    if (key === 'tranid'){
                        const link = url.resolveRecord({
                            isEditMode: false,
                            recordId: res.id,
                            recordType: res.recordType,
                        });
                        value = '<a href="'+link+'" target="_blank">'+value+'</a>'
                    } else if (type !== 'salesorder' && key === 'class') {
                    }
                    list.setSublistValue({
                        id: key,
                        line: index,
                        value: value
                    });
                }
            });
            const grossnum = parseFloat(res.amount);
            calcs.universal+= grossnum;
            if (type !== 'salesorder') {
                const weightvalue = grossnum*(parseFloat(res.probability)/100);
                list.setSublistValue({
                    id: 'custpage_weighted',
                    line: index,
                    value: weightvalue
                });
                if (type === 'estimate') {
                    calcs.weighted+=weightvalue;
                    calcs.gross+=grossnum;
                }
            }
        });

        return list;
    }

    function performSearch(type, filter) {
        log.audit({title: 'Finding Transactions...'});
        let searchResults = []
        s.create({
            type: s.Type.TRANSACTION,
            filters: searchFilter(filter, type),
            columns: typesDictionary[type].fields.map(op => op.id)
        }).run().each(res => {
            searchResults.push(translate(res));
            return true;
        });
        return searchResults;
    }

    function searchFilter(filter, transactionType) {
        let searchFilter = [];

        const subsFilter = s.createFilter({
            name: 'subsidiary',
            operator: s.Operator.ANYOF,
            values: '2'
        });
        searchFilter.push(subsFilter);
        if (transactionType) {
            const typeFilter = s.createFilter({
                name: 'type',
                operator: s.Operator.ANYOF,
                values: typesDictionary[transactionType].searchFilter
            });
            searchFilter.push(typeFilter);
        }

        const { salesrep, property } = filter;
        if (repFiltered(filter)) {
            const repFilter = s.createFilter({
                name: 'salesrep',
                operator: s.Operator.ANYOF,
                values: salesrep
            });
            searchFilter.push(repFilter);
            log.debug({title: 'filter salesrep', details: salesrep});
        }
        if (propFiltered(filter)) {
            const propertyFilter = s.createFilter({
                name: 'class',
                operator: s.Operator.ANYOF,
                values: property
            });
            searchFilter.push(propertyFilter);
            log.debug({title: 'filter property', details: property});
        }

        const startdate = format.format({value: filter.startdate, type: format.Type.DATE});
        const enddate = format.format({value: filter.enddate, type: format.Type.DATE});
        const startFilter = s.createFilter({
            name: 'custcol_agency_mf_flight_end_date',
            operator: s.Operator.ONORAFTER,
            values: startdate
        });
        const endFilter = s.createFilter({
            name: 'custcol_agency_mf_flight_end_date',
            operator: s.Operator.ONORBEFORE,
            values: enddate
        });
        searchFilter.push(startFilter, endFilter);

        log.debug({title: 'filter startdate', details: startdate});
        log.debug({title: 'filter enddate', details: enddate});

        return searchFilter;
    }

    function getSalesReps(field, selected) {
        field.addSelectOption({
            value: 0,
            text: '-- select sales rep --',
            isSelected: false
        });

        s.create({
            type: s.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
            filters: ['subsidiary', s.Operator.ANYOF, ['2']]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})){
                field.addSelectOption({
                    value: res.id,
                    text: res.getValue({name: 'entityid'}),
                    isSelected: (res.id === selected)
                });
            }
            return true;
        });
    }

    function getProperties(field, selected) {
        field.addSelectOption({
            value: 0,
            text: '-- select property --',
            isSelected: false
        });

        s.create({
            type: s.Type.CLASSIFICATION,
            columns: ['name'],
            filters: [
                ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            field.addSelectOption({
                value: res.id,
                text: res.getValue({name: 'name'}),
                isSelected: (res.id === selected)
            });
            return true;
        });
    }

    function defaultStart(start) {
        const date = (start) ? new Date(start.substring(0, start.indexOf('00:00:00'))) : new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    function defaultEnd(end) {
        const date = (end) ? new Date(end.substring(0, end.indexOf('00:00:00'))) : new Date();
        return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    function translate(result) {
        const fields = typesDictionary[result.recordType].fields;
        const row = {
            id: result.id,
            recordType: result.recordType
        };
        fields.forEach(f => {
            if (f.type === ui.FieldType.TEXT) {
                row[f.id] = result.getText({name: f.id});
            } else {
                row[f.id] = result.getValue({name: f.id});
            }
        })
        return row;
    }

    function addQuota(page, filter) {
        const quotaField = page.addField({
            id: 'custpage_quota',
            label: 'Quota',
            type: ui.FieldType.CURRENCY,
        });
        quotaField.defaultValue = findQuota(filter);

        quotaField.updateBreakType({
            breakType : ui.FieldBreakType.STARTCOL
        });
        quotaField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
    }

    function findQuota(filter) {

        let hasPermissions = true;
        let fileFound = false;
        let quotaCSV = '';
        
        try {
            quotaCSV = file.load({
                id: './quotaResults.csv'
            });
            fileFound = true;
        }
        catch(err) {
            if (err.name == 'INSUFFICIENT_PERMISSION') {
                hasPermissions = false
            } else if (err.name == 'RCRD_DSNT_EXIST'){
                refreshQuotaResults();
            } else {
                log.error({
                    title: err.toString(),
                    details: err.stack
                })
            }
        }

        if (!hasPermissions || !fileFound) return 0;

        log.debug({
            title: 'Quota CSV File Description',
            details: quotaCSV.description
        })

        let quotas = [];
        // filter quotas
        const month = filter.startdate.getMonth();
        const year = filter.startdate.getYear();

        const lessInfo = (moreInfo) => {
            const {salesrep, property, date, amountmonthly} = moreInfo;
            const lessismore = { 
                salesrep: salesrep,
                property: property,
                date: date,
                amountmonthly: amountmonthly
            };
            return lessismore;
        };
        const csvObjs = processCSV(quotaCSV).map(obj => lessInfo(obj));

        const getRepName = (id) => {
            if (!id || id === '0') return '';
            const employeeRecord = record.load({type: record.Type.EMPLOYEE, id: id});
            log.debug({
                title: 'repRecord',
                details: JSON.stringify(employeeRecord)
            });
            return employeeRecord.getValue({fieldId: 'entityid'});
        }
        const getPropertyName = (id) => {
            if (!id || id === '0') return '';
            const propertyRecord = record.load({type: record.Type.CLASSIFICATION, id: id});
            log.debug({
                title: 'propertyRecord',
                details: JSON.stringify(propertyRecord)
            });
            return propertyRecord.getValue({fieldId: 'name'});
        }

        const { salesrep, property } = filter;
        const repName = getRepName(salesrep);
        const propertyName = getPropertyName(property);

        log.debug({
            title: 'repName',
            details: repName
        });
        
        log.debug({
            title: 'propertyName',
            details: propertyName
        });
        
        csvObjs.forEach(quota => {
            if (quota.date) {
                const date = new Date(quota.date);
                const hasYear = (year == date.getYear());
                const hasMonth = (month == date.getMonth());
                if (hasMonth && hasYear) {
                    const hasRep = !(repName && repName !== quota.salesrep);
                    const hasProperty = !(propertyName && propertyName !== quota.property);
                    if (hasRep && hasProperty) quotas.push(quota);
                }
            }
        });
        // sum the remaining monthly amounts
        const numOr0 = n => isNaN(parseInt(n)) ? 0 : parseInt(n);
        const quotaTotal = quotas.reduce((total, current) => numOr0(total) + numOr0(current.amountmonthly), 0);

        return quotaTotal;
    }

    const csvSplit = (line) => {
        let splitLine = [];

        const quotesplit = line.split('"');
        const lastindex = quotesplit.length - 1;
        // split evens removing outside quotes, push odds
        quotesplit.forEach((val, index) => {
            if (index % 2 === 0) {
                const firstchar = (index == 0) ? 0 : 1;
                const trimmed = (index == lastindex) 
                    ? val.substring(firstchar)
                    : val.slice(firstchar, -1);
                trimmed.split(",").forEach(v => splitLine.push(v));
            } else {
                splitLine.push(val);
            }
        });
        return splitLine;
    }
    function processCSV(file){
        const iterator = file.lines.iterator();

        let keys = [];
        let key = '';
        let csvObjArray = [];
        
        // add header as object keys
        iterator.each(line =>{
            const header = line.value.toLowerCase().replace(/\s/g, '')
            keys = csvSplit(header);
            return false;
        });
        log.debug({title: 'CSV Keys', details: keys});
        iterator.each(line => {
            const values = csvSplit(line.value);
            let lineobj = {};
            values.forEach((val, index) => {
                key = keys[index];
                if (key) lineobj[key] = val;
            });
            csvObjArray.push(lineobj);
            return true;
        });
        return csvObjArray;
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
                searchInternalIds = res.id;
                return false;
            }
            return true;
        });

        // SUBMIT TASK
        if (searchInternalId) {
            const quotaTask = task.create({taskType: task.TaskType.SEARCH});
            quotaTask.savedSearchId = searchInternalId;
            quotaTask.filePath = 'SuiteScripts/Suitelets/sandbox-forecast/quotaResults.csv';
            const quotaTaskId = quotaTask.submit();
            log.debug({title: 'quotaTaskId', details: quotaTaskId});
        } else {
            log.error({
                title: 'Quota Task Error',
                details: 'customsearch_acbm_quota_search not found, quotaResults.csv could not be built'
            })
        }
    }

    exports.onRequest = onRequest;
    return exports;
});