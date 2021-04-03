define(["N/currentRecord", "N/record"], function (cr, record) {

    /**
     * Client Script to perform search in forecast suitelet
     *
     * @exports sandbox-forecast/cl
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     * 
     * @requires N/currentRecord
     * @requires N/record
     * 
     * @NApiVersion 2.x
     * @NScriptType ClientScript
     */
    var exports = {};
    const page = cr.get();

    function pageInit() {
        window.onbeforeunload = null;
    }


    function fieldChanged(context) {
        if (context.fieldId == 'custpage_startdate' || context.fieldId === 'custpage_fullyear') {
            console.info("datesChanged...");
            var startdate = page.getValue({fieldId: 'custpage_startdate'});
            const fullyear = page.getValue({fieldId: 'custpage_fullyear'});
            const date = new Date(startdate);
            const enddate = (fullyear)
                ? new Date(startdate.getFullYear(), 11, 31)
                : new Date(startdate.getFullYear(), date.getMonth() + 1, 0);

            page.setValue({
                fieldId: 'custpage_enddate',
                value: enddate,
                ignoreFieldChange: true
            });
            startdate = new Date(startdate.getFullYear(), date.getMonth(), 1);

            page.setValue({
                fieldId: 'custpage_startdate',
                value: startdate,
                ignoreFieldChange: true
            });
        }
        // Updates for weighted and forecast calcs when line items change
        if (context.fieldId === 'custpage_forecast' 
            || context.fieldId === 'probability' 
            || context.fieldId === 'amount') {
            const sublistId = context.sublistId;
            const line = context.line;
            console.info('forecast changed... ' + sublistId + ' line# ' + line);
            var weighted = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'custpage_weighted',
                line: line
            });
            var calcweighted = page.getValue({fieldId: 'custpage_calcweight'});
            const gross = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'amount',
                line: line
            });
            var calcgross = page.getValue({fieldId: 'custpage_calcgross'});
            const checked = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'custpage_forecast',
                line: line
            });
            if (context.fieldId === 'custpage_forecast') {
                // add or remove gross and weighted for forecast checkbox action
                if (checked) {
                    calcweighted += weighted;
                    calcgross += gross;
                    page.setValue({fieldId: 'custpage_calcweight', value: calcweighted.toFixed(2)});
                    page.setValue({fieldId: 'custpage_calcgross', value: calcgross.toFixed(2)});
                } else {
                    calcweighted -= weighted;
                    calcgross -= gross;
                    page.setValue({fieldId: 'custpage_calcweight', value: calcweighted.toFixed(2)});
                    page.setValue({fieldId: 'custpage_calcgross', value: calcgross.toFixed(2)});
                }
            } else { // line item change via either probability or gross
                console.info('item amount change...');
                const probability = page.getSublistValue({
                    sublistId: sublistId,
                    fieldId: 'probability',
                    line: line
                });
                const probnum = (parseFloat(probability)/100);

                var updatelines = [];
                var grossDelta = 0;
                if (context.fieldId === 'amount') {
                    // use the old weighted and probability to find the old gross
                    const oldgross = weighted/probnum;
                    grossDelta = gross - oldgross;
                    updatelines = [line];
                } else { // build an array of common transacation record lines to update probability
                    const tranid = page.getSublistValue({
                        sublistId: sublistId,
                        fieldId: 'tranid',
                        line: line
                    }).replace(/<[^>]*>/g, '');
                    const numlines = page.getLineCount({sublistId: sublistId});
                    for (var i = 0; i < numlines; i++) {
                        var id = page.getSublistValue({
                            sublistId: sublistId,
                            fieldId: 'tranid',
                            line: i
                        }).replace(/<[^>]*>/g, '');
                        if (id === tranid) updatelines.push(i);
                    }
                }
                // update each line (just one for gross change)
                updatelines.forEach(function(row) {
                    var oldweighted = page.getSublistValue({
                        sublistId: sublistId,
                        fieldId: 'custpage_weighted',
                        line: row
                    });
                    const rowgross = page.getSublistValue({
                        sublistId: sublistId,
                        fieldId: 'amount',
                        line: row
                    });
                    var newWeighted = (rowgross*probnum);
                    if (checked) {
                        var weightDelta = newWeighted - oldweighted;
                        calcweighted += weightDelta;
                    }
                    // update line item weighted and probability
                    page.selectLine({sublistId: sublistId, line: row});
                    page.setCurrentSublistValue({
                        sublistId: sublistId,
                        fieldId: 'probability',
                        value: probability,
                        ignoreFieldChange: true
                    });
                    page.setCurrentSublistValue({
                        sublistId: sublistId,
                        fieldId: 'custpage_weighted',
                        value: newWeighted.toFixed(2),
                        ignoreFieldChange: true
                    });
                    page.commitLine({sublistId: sublistId});
                });
                // update the forecast calculation if included via line item check
                if (checked) {
                    page.setValue({fieldId: 'custpage_calcweight', value: calcweighted.toFixed(2)});
                    if (grossDelta !== 0) {
                        calcgross += grossDelta;
                        page.setValue({fieldId: 'custpage_calcgross', value: calcgross.toFixed(2)});
                    }
                }
            }
        }
    }

    function performSearch() {
        const page = cr.get();
        console.info('Performing Forecast Search...');

        const salesrep = page.getValue({fieldId: 'custpage_salesrep'});
        const property = page.getValue({fieldId: 'custpage_property'});
        const startdate = page.getValue({fieldId: 'custpage_startdate'});
        const enddate = page.getValue({fieldId: 'custpage_enddate'});
        const fullyear = page.getValue({fieldId: 'custpage_fullyear'});

        const filteredURL = new URL(document.location.href);

        filteredURL.searchParams.set('salesrep', salesrep);
        filteredURL.searchParams.set('property', property);
        filteredURL.searchParams.set('startdate', startdate);
        filteredURL.searchParams.set('enddate', enddate);
        filteredURL.searchParams.set('fullyear', fullyear);

        window.location.replace(filteredURL);
    }

    function save() {
        console.info('Saving Record Changes...');
        const opportunityValues = getEntryValues('custpage_opportunity');
        const proposalValues = getEntryValues('custpage_estimate');

        const oppRecords = recordsOnly(opportunityValues);
        recordsOnly(proposalValues);

        // TODO set the amount on each opportunity item from form
        //setSubitems(oppRecords)

        console.info(oppRecords);
    }
    function getIDfromHTML(html){
        const params = html.substring(html.indexOf('id='));
        return params.substring(3,params.indexOf('&'));
    }
    function getEntryValues(sublistId) {
        entryValues = [];
        const total = page.getLineCount({sublistId: sublistId});
        for (var line = 0; line < total; line++) {
            var tranid = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'tranid',
                line: line
            })
            const id = getIDfromHTML(tranid);

            var probability = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'probability',
                line: line
            })

            if (sublistId == 'custpage_estimate') {
                entryValues.push({
                    id: id,
                    type: record.Type.ESTIMATE,
                    probability: probability
                });
                continue;
            }
            var amount = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'amount',
                line: line
            })
            var flightendfull = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'custcol_agency_mf_flight_end_date',
                line: line
            }).toString();
            var flightend = flightendfull.substring(0, flightendfull.indexOf('00:00:00'));

            entryValues.push({
                id: id,
                type: record.Type.OPPORTUNITY,
                flightend: flightend,
                probability: probability,
                gross: amount
            });
        }
        return entryValues;
    }
    function recordsOnly(allEntry) {
        return allEntry.filter(function(entry, index, self){
            return (self.findIndex(function(dup){
                return (dup.id === entry.id)
            }) === index);
        }).map(setProbGetRecord);
    }

    function setProbGetRecord(entryObj) {
        const transactionRecord = record.load({type: entryObj.type, id: entryObj.id});
        // set probability and return keyed on id for use with item amounts
        transactionRecord.setValue({fieldId: 'probability', value: entryObj.probability});
        // TODO This does not work =/

        return transactionRecord;
    }


    exports.pageInit = pageInit;
    exports.performSearch = performSearch;
    exports.fieldChanged = fieldChanged;
    exports.save = save;

    return exports;
});
