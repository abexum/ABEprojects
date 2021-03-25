define(["N/search", "N/transaction", "N/ui/serverWidget", "N/error", "N/log"], function (s, t, ui, error, log) {

    /**
     * Forecast Suitelet: Display Search Results in a List
     *
     * @exports sandbox-forecast
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/transaction
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
            id: 'tranid',
            label: 'Number',
            type: ui.FieldType.PASSWORD
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
            id: 'tranid',
            label: 'Number',
            type: ui.FieldType.PASSWORD
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
            id: 'tranid',
            label: 'Number',
            type: ui.FieldType.PASSWORD
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

    const filter = ['salesrep', s.Operator.ANYOF, ['988']]; // BRIAN HINES

    function onRequest(context) {
        log.audit({title: 'Request received.'});

        var pageFull = ui.createForm({
            title : 'Forecast Suitelet'
        });

        pageFull.addField({
            id: 'salesrep',
            label: 'Sales Rep',
            type: ui.FieldType.TEXT,
            source: 'salesrep'
        })
        pageFull.addField({
            id: 'agency',
            label: 'Property',
            type: ui.FieldType.TEXT,
            source: 'agency'
        })
        pageFull.addField({
            id: 'date',
            label: 'Month',
            type: ui.FieldType.DATE,
            source: 'date'
        })
        renderList(pageFull, 'opportunity', translate(performSearch('opportunity')));
        renderList(pageFull, 'estimate', translate(performSearch('estimate')));
        renderList(pageFull, 'salesorder', translate(performSearch('salesorder')));

        context.response.writePage({
            pageObject: pageFull
        });
    }

    function renderList(form, type, results) {

        var list = form.addSublist({
            id : 'custpage_' + type,
            type : ui.SublistType.LIST,
            label : typesDictionary[type].label + ' [' + results.length +']'
        });

        const columns = typesDictionary[type].fields;
        columns.forEach(id => list.addField(id));

        results.forEach((res, index) => {
            Object.keys(res).forEach(key => {
                log.debug({title: 'Result', details: JSON.stringify(res)});
                // add value if present
                var entry = res[key]
                if (entry) {
                    list.setSublistValue({
                        id: key,
                        line: index,
                        value: entry
                    });
                }
            });
        });
        return list;
    }

    function performSearch(type) {
        log.audit({title: 'Finding Transactions...'});
        return s.create({
            type: s.Type.TRANSACTION,
            filters: [
                ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['type', s.Operator.ANYOF, typesDictionary[type].searchFilter], 'and',
                filter
            ],
            columns: typesDictionary[type].fields.map(op => op.id)
        }).run().getRange({start: 0, end: 1000});
    }

    function opportunitySearch() {
        log.audit({title: 'Finding Opportunities...'});
        return s.create({
            type: s.Type.OPPORTUNITY,
            filters: [
                ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                filter
            ],
            columns: opportunityFields.map(op => op.id)
        }).run().getRange({start: 0, end: 1000});
    }

    function translate(results) {
        return results.map(result => {
            log.debug({title: 'Record Type', details: result.recordType});
            const fields = typesDictionary[result.recordType].fields;
            var row = {};
            fields.forEach(f => {
                if (f.type === ui.FieldType.TEXT) {
                    row[f.id] = result.getText({name: f.id});
                } else {
                    row[f.id] = result.getValue({name: f.id});
                }
            })
            return row;
        });
    }

    exports.onRequest = onRequest;
    return exports;

/*
    FILTERS
    Subsidiary > MAKE THIS 
    Sales Rep > salesrep
    Property > custentity4
    Date Start + Date End > custcol_agency_mf_flight_end_date

    INFORMATIONAL HEADERS
    quota
    forecast is weighted
    calculated: worst case, most likely, upside
    override: worst case, most likely, upside
    currency

    COLUMNS OPPORTUNITY
    forecast type
    date > custcol_agency_mf_flight_end_date
    client (Agency) > custentity5
    number 
    status > customrecord_ns_ibe_req_plan_statuses ? customrecord_ns_ibe_project_statuses
    probability
    item total (change to AMOUNT for PERIOD month of Opportunity Item)
        Batch Date > custbody_solupay_batchdate
        Batch Amount > custbody_solupay_batchamount
        Opportunity Period > custcol4
        Amount > custcol3
    worst case
    most likely
    upside
    currency

    PROPOSALS
    forecast type
    date > custcol_agency_mf_flight_end_date
    client (Agency) > custentity5
    number 
    opportunity ???
    status > customrecord_ns_ibe_req_plan_statuses ? customrecord_ns_ibe_project_statuses
    -- expiration date > duedate
    probability
    billing schedule
    forecast amount
    currency

    ORDERS (UNBILLED ORDERS + ACTUALS)
    -- purchase order > custcol_agency_mf_purchase_order
    -- record is the type shown in type column
    date
    client
    type (insertion order (salesord), invoice, credit memo)
    number
    opportunity
    total
    forecast amount
    currency

    HISTORY
    -- mirrors calculated + override info for recent month
    -- has your name... seems useless and not adding new info
    date entered
    entered by
    calc. worst case
    calc. most likely
    calc. upside
    worst case
    most likely
    upside

*/
});
