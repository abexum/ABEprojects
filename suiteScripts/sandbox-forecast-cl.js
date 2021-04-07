define(['N/currentRecord', 'N/record'], function(cr, record) {

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
     * @ModuleScope Public
     * @NScriptType ClientScript
     */
    var exports = {};
    const page = cr.get();

    function pageInit() {
        window.onbeforeunload = null;
    }

    var editlog = [];

    var predictionsUpdated = false;

    function fieldChanged(context) {

        if (context.fieldId == 'custpage_worstcase'
            || context.fieldId === 'custpage_mostlikely'
            || context.fieldId === 'custpage_upside') {
            predictionsUpdated = true;
        }

        if (context.fieldId === 'custpage_startdate' || context.fieldId === 'custpage_fullyear') {
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
                editlog.push(getInternalId(sublistId, line)) // add to list of edited records for later save
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
        console.info(editlog);
        const opportunityEntries = getEntryValues('custpage_opportunity').filter(edited);
        const proposalEntries = getEntryValues('custpage_estimate').filter(edited);

        Promise.all(proposalEntries.map(setProbability))

        Promise.all(opportunityEntries.map(setProbabilityAndAmounts));

        if (predictionsUpdated) {
            const worstcase = page.getValue({fieldId: 'custpage_worstcase'});
            const mostlikely = page.getValue({fieldId: 'custpage_mostlikely'});
            const upside = page.getValue({fieldId: 'custpage_upside'});

            const filteredURL = new URL(document.location.href);

            filteredURL.searchParams.set('worstcase', worstcase);
            filteredURL.searchParams.set('mostlikely', mostlikely);
            filteredURL.searchParams.set('upside', upside);
            window.location.replace(filteredURL);
        }

        editlog = [];
    }

    function getInternalId(sublistId, line) {
        const tranid = page.getSublistValue({
            sublistId: sublistId,
            fieldId: 'tranid',
            line: line
        })
        return getIDfromHTML(tranid);
    }

    function getIDfromHTML(html){
        const params = html.substring(html.indexOf('id='));
        return params.substring(3,params.indexOf('&'));
    }

    function edited(entry) {
        return editlog.includes(entry.id);
    }

    function getEntryValues(sublistId) {
        entryValues = [];
        const total = page.getLineCount({sublistId: sublistId});
        var lineitems = [];
        var preventry = {};
        var previd = '';
        for (var line = 0; line < total; line++) {
            var id = getInternalId(sublistId, line);

            var probability = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'probability',
                line: line
            })

            if (sublistId === 'custpage_estimate') {
                if (previd !== id){
                    entryValues.push({
                        id: id,
                        type: record.Type.ESTIMATE,
                        probability: probability
                    });
                    previd = id;
                }
                continue;
            }
            if (previd !== id && line !== 0) {
                entryValues.push(preventry);
                lineitems = [];
                previd = id;
            }
            var amount = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'amount',
                line: line
            })
            var flightend = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'custcol_agency_mf_flight_end_date',
                line: line
            }).toString();
            lineitems.push({
                flightend: flightend,
                gross: amount
            });
            preventry = {
                id: id,
                type: record.Type.OPPORTUNITY,
                probability: probability,
                lineitems: lineitems,
            }
            if (line === (total-1)){
                entryValues.push(preventry);
            }
        }

        return entryValues;
    }

    function setProbability(entryObj) {
        const submission = record.submitFields.promise({
            type: entryObj.type,
            id: entryObj.id,
            values: {
                probability: entryObj.probability
            },
            options: {
                enablesourcing: false,
                ignoreMandatoryFields: true
            }
        });
        console.info('Updated Proposal ID: ' + entryObj.id);
        return submission;
    }

    function setProbabilityAndAmounts(entryObj) {
        const loaded = record.load.promise({
            type: entryObj.type,
            id: entryObj.id,
        });
        loaded.then(function(recObj){
            // probability set once on opportunity item
            recObj.setValue({
                fieldId: 'probability',
                value: entryObj.probability,
                ignoreFieldChange: true
            })

            // index line number on sublist by flight end date to match with table info
            const linecount = recObj.getLineCount({sublistId: 'item'});
            var dateindex = {};
            for (var line = 0 ; line < linecount; line++) {
                var flightend = recObj.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_agency_mf_flight_end_date',
                    line: line
                }).toString();
                dateindex[flightend] = line;
            }

            // update line item amounts from gross in table
            entryObj.lineitems.forEach(function(itementry){
                recObj.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'amount',
                    line: dateindex[itementry.flightend],
                    value: itementry.gross
                });
            });
            var recordId = recObj.save({ignoreMandatoryFields: true});
            console.info('Updated Opportunity ID: ' + recordId);
        }).catch(function(reason) {
            console.info("Failed: " + reason);
            console.info('error name: ' + reason.name);
            //do something on failure
        });
        return;
    }

    exports.pageInit = pageInit;
    exports.performSearch = performSearch;
    exports.fieldChanged = fieldChanged;
    exports.save = save;

    return exports;
});
