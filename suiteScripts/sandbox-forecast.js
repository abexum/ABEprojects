define(["N/search", "N/url", "N/record", "N/format", "N/ui/serverWidget", "N/error", "N/log"], function (s, url, r, f, ui, error, log) {

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
    var exports = {};

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

    const commonFields = [
        { 
            id: 'tranid',
            label: 'Transaction ID',
            type: ui.FieldType.PASSWORD
        },
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
            id: 'trandate',
            label: 'Date',
            type: ui.FieldType.DATE
        },
        {
            id: 'custcol_agency_mf_flight_end_date',
            label: 'Flight End',
            type: ui.FieldType.DATE
        },
        { 
            id: 'entity',
            label: 'Client',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'amount',
            label: 'Amount',
            type: ui.FieldType.CURRENCY
        }
    ];
    const opportunityFields = [
        { 
            id: 'entitystatus',
            label: 'Status',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'probability',
            label: 'Probability',
            type: ui.FieldType.PERCENT
        }
    ];
    const proposalFields = [
        { 
            id: 'entitystatus',
            label: 'Status',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'duedate',
            label: 'Expiration Date',
            type: ui.FieldType.DATE
        },
        { 
            id: 'probability',
            label: 'Probability',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'total',
            label: 'Total',
            type: ui.FieldType.CURRENCY
        }
    ];
    const orderFields = [
        { 
            id: 'opportunity',
            label: 'Opportunity',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'total',
            label: 'Total',
            type: ui.FieldType.CURRENCY
        }
    ];

    const typesDictionary = {
        opportunity: {
            id: 'tranid',
            label: 'Opportunities',
            fields: commonFields.concat(opportunityFields),
            searchFilter: ['Opprtnty']
        },
        estimate: {
            id: 'tranid',
            label: 'Proposals',
            fields: commonFields.concat(proposalFields),
            searchFilter: ['Estimate']
        },
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields.concat(orderFields),
            searchFilter: ['SalesOrd']
        },
    };

    function onRequest(context) {
        log.audit({title: 'Request received.'});

        var page = ui.createForm({
            title: 'Forecast Suitelet'
        });

        var filter = getFilter(context.request);

        page.clientScriptModulePath = "./sandbox-forecast-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Perform Search',
            functionName: 'performSearch'
        });

        filterOptionsSection(page, filter);
        dateSection(page, filter);

        Object.keys(typesDictionary).forEach(key => {
            renderList(page, key, performSearch(key, filter));
        });

        addQuota(page, filter);

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

    function addQuota(page, filter) {
        const quotaField = page.addField({
            id: 'custpage_quota',
            label: 'Quota',
            type: ui.FieldType.CURRENCY,
            // container: 'custpage_filtergroup'
        });
        quotaField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        // quotaField.updateLayoutType({layoutType: ui.FieldLayoutType.OUTSIDEABOVE});
        quotaField.defaultValue = findQuota(filter);

        quotaField.updateBreakType({
            breakType : ui.FieldBreakType.STARTCOL
        });
    }

    function findQuota(filter) {
        return 1000
    }

    function getFilter(request) {
        const { salesrep, property, startdate, enddate } = request.parameters;

        log.debug({title: 'startdate', details: startdate});
        log.debug({title: 'enddate', details: enddate});

        const startValue = defaultStart(startdate);
        const endValue = defaultEnd(enddate);

        log.debug({title: 'startValue', details: startValue});
        log.debug({title: 'endValue', details: endValue});

        return {
            salesrep: salesrep,
            property: property,
            startdate: startValue,
            enddate: endValue
        }
    }

    function renderList(form, type, results) {
        var list = form.addSublist({
            id : 'custpage_' + type,
            type : ui.SublistType.LIST,
            label : typesDictionary[type].label + ' [' + results.length +']'
        });

        const columns = typesDictionary[type].fields;
        columns.forEach(id => {
            list.addField(id);
            if (id.id === 'tranid'){
                var field = list.addField({
                    id: 'custpage_recordid',
                    label: 'Record',
                    type: ui.FieldType.URL,
                });
                field.linkText = 'link';
            }
        });

        results.forEach((res, index) => {
            Object.keys(res).forEach(key => {
                var value = res[key]
                if (value && key !== 'recordType' && key !== 'id') {
                    list.setSublistValue({
                        id: key,
                        line: index,
                        value: value
                    });
                    if (key === 'tranid'){
                        var link = url.resolveRecord({
                            isEditMode: false,
                            recordId: res.id,
                            recordType: res.recordType,
                        });
                        list.setSublistValue({
                            id: 'custpage_recordid',
                            line: index,
                            value: link,
                        });
                    }

                }
            });
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

    function searchFilter(filter, type) {
        let searchFilter = [];

        const subsFilter = s.createFilter({
            name: 'subsidiary',
            operator: s.Operator.ANYOF,
            values: '2'
        });
        const typeFilter = s.createFilter({
            name: 'type',
            operator: s.Operator.ANYOF,
            values: typesDictionary[type].searchFilter
        });
        searchFilter.push(subsFilter, typeFilter);

        const { salesrep, property } = filter;
        if (salesrep && salesrep !== '0') {
            const repFilter = s.createFilter({
                name: 'salesrep',
                operator: s.Operator.ANYOF,
                values: salesrep
            });
            searchFilter.push(repFilter);
            log.debug({title: 'filter salesrep', details: salesrep});
        }
        if (property && property !== '0') {
            const propertyFilter = s.createFilter({
                name: 'class',
                operator: s.Operator.ANYOF,
                values: property
            });
            searchFilter.push(propertyFilter);
            log.debug({title: 'filter property', details: property});
        }

        const startdate = f.format({value: filter.startdate, type: f.Type.DATE});
        const enddate = f.format({value: filter.enddate, type: f.Type.DATE});
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
        var row = {
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

    exports.onRequest = onRequest;
    return exports;
});
