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

    const opportunityFields = [
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
            id: 'trandate',
            label: 'Date',
            type: ui.FieldType.DATE
        },
        { 
            id: 'entity',
            label: 'Client',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'entitystatus',
            label: 'Status',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'probability',
            label: 'Probability',
            type: ui.FieldType.PERCENT
        },
        // { 
        //     id: 'projectedtotal',
        //     label: 'Item Total',
        //     type: ui.FieldType.CURRENCY
        // }
    ];
    const proposalFields = [
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
            id: 'trandate',
            label: 'Date',
            type: ui.FieldType.DATE
        },
        { 
            id: 'entity',
            label: 'Client',
            type: ui.FieldType.TEXT
        },
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
            id: 'trandate',
            label: 'Date',
            type: ui.FieldType.DATE
        },
        { 
            id: 'entity',
            label: 'Client',
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
            fields: opportunityFields,
            searchFilter: ['Opprtnty']
        },
        estimate: {
            id: 'tranid',
            label: 'Proposals',
            fields: proposalFields,
            searchFilter: ['Estimate']
        },
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: orderFields,
            searchFilter: ['SalesOrd']
        },
    };

    function onRequest(context) {
        log.audit({title: 'Request received.'});

        var page = ui.createForm({
            title : 'Forecast Suitelet'
        });

        // const filter = getFilter(context.request);

        page.clientScriptModulePath = "./sandbox-forecast-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Perform Search',
            functionName: 'performSearch'
        });

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
        getSalesReps(salesRepSearchField);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getProperties(propertySearchField);

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
        startDateField.defaultValue = defaultStart();

        const endDateField = page.addField({
            id: 'custpage_enddate',
            label: 'End Date',
            type: ui.FieldType.DATE,
            container: 'custpage_dategroup'
        });
        endDateField.defaultValue = defaultEnd();

        renderList(
            page,
            'opportunity', 
            translate(performSearch('opportunity', getFilter(context.request, 'opportunity')))
            );
        renderList(
            page,
            'estimate',
            translate(performSearch('estimate', getFilter(context.request, 'estimate')))
            );
        renderList(
            page,
            'salesorder',
            translate(performSearch('salesorder', getFilter(context.request, 'salesorder')))
            );

        context.response.writePage({
            pageObject: page
        });
    };

    function getFilter(request, type) {
        const { salesrep, property, startdate, enddate } = request.parameters;

        const startValue = (startdate) ? new Date(startdate) : defaultStart();
        const endValue = (enddate) ? new Date(enddate) : defaultEnd();

        const fStart = f.format({value: startValue, type: f.Type.DATE});
        const fEnd = f.format({value: endValue, type: f.Type.DATE});

        log.debug({title: 'filter salesrep', details: salesrep});
        log.debug({title: 'filter property', details: property});
        log.debug({title: 'filter startdate', details: fStart});
        log.debug({title: 'filter enddate', details: fEnd});

        // return {
        //     salesrep: salesrep,
        //     property: property,
        //     startdate: fStart,
        //     enddate: fEnd
        // }

        let filter = [];

        const subsFilter = s.createFilter({
            name: 'subsidiary',
            operator: s.Operator.ANYOF,
            values: '2'
        });
        filter.push(subsFilter);

        const typeFilter = s.createFilter({
            name: 'type',
            operator: s.Operator.ANYOF,
            values: typesDictionary[type].searchFilter
        });
        filter.push(typeFilter);

        if (salesrep) {
            const repFilter = s.createFilter({
                name: 'salesrep',
                operator: s.Operator.ANYOF,
                values: salesrep
            });
            filter.push(repFilter);
        }
        // Make this filter on the property from the items on transaction record
        // if (property) {
        //     filter.push('and');
        //     filter.push(['entity', s.Operator.ANYOF, [property]]);
        // }

        // TODO use date from items on transaction records instead of trandate
        // if (startdate && enddate) {
        //     const stringDates = [
        //         f.format({value: startdate, type: f.Type.DATE}),
        //         f.format({value: enddate, type: f.Type.DATE})
        //     ];
        //     const dateFilter = s.createFilter({
        //         name: 'trandate',
        //         operator: s.Operator.WITHIN,
        //         values: stringDates
        //     });
        //     filter.push(dateFilter);
        // }

        const startFilter = s.createFilter({
            name: 'trandate',
            operator: s.Operator.ONORAFTER,
            values: fStart
        });
        filter.push(startFilter);
        const endFilter = s.createFilter({
            name: 'trandate',
            operator: s.Operator.ONORBEFORE,
            values: fEnd
        });
        filter.push(endFilter);

        return filter;
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
                // log.debug({title: 'Result', details: JSON.stringify(res)});
                // add value if present
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
    };

    function performSearch(type, filter) {
        log.audit({title: 'Finding Transactions...'});
        return s.create({
            type: s.Type.TRANSACTION,
            filters: filter,
            columns: typesDictionary[type].fields.map(op => op.id)
        }).run().getRange({start: 0, end: 1000});
    };

    function getSalesReps(field) {
        s.create({
            type: s.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
            filters: ['subsidiary', s.Operator.ANYOF, ['2']]
        }).run().each(res => {
            log.debug({title: 'Employee result', details: JSON.stringify(res)});
            if (res.getValue({name: 'issalesrep'})){
                field.addSelectOption({
                    value: res.id,
                    text: res.getValue({name: 'entityid'}),
                    isSelected: false
                });
            }
            return true;
        });
    };

    function getProperties(field) {
        s.create({
            type: s.Type.CLASSIFICATION,
            columns: ['name'],
            filters: [
                ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            log.debug({title: 'Property result', details: JSON.stringify(res)});
            field.addSelectOption({
                value: res.id,
                text: res.getValue({name: 'name'}),
                isSelected: false
            });
            return true;
        });
    };

    function defaultStart() {
        var date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    function defaultEnd() {
        var date = new Date();
        return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    function defaultDates(startDateField, endDateField) {
        var date = new Date();
        var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        startDateField.defaultValue = firstDay;
        endDateField.defaultValue = lastDay;
    };

    // LOAD RECORD EXAMPLE (VERY SLOW)
    // var record = r.load({
    //     type: r.Type.EMPLOYEE,
    //     id: res.id,
    // });
    // log.debug({title: 'Employee record', details: JSON.stringify(record)});

    // NOT USED, optional if better than transaction search
    // function opportunitySearch() {
    //     log.audit({title: 'Finding Opportunities...'});
    //     return s.create({
    //         type: s.Type.OPPORTUNITY,
    //         filters: [
    //             ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
    //             filter
    //         ],
    //         columns: opportunityFields.map(op => op.id)
    //     }).run().getRange({start: 0, end: 50});
    // }

    function translate(results) {
        return results.map(result => {
            // log.debug({title: 'Record raw', details: JSON.stringify(result)});
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
        });
    };

    exports.onRequest = onRequest;
    return exports;
});
