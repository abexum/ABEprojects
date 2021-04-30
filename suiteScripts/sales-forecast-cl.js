define(['N/currentRecord', 'N/record'], function(cr, record) {

    /**
     * Client Script to perform search and save values in forecast suitelet
     *
     * @exports sales-forecast/cl
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
        const lines = page.getLineCount({sublistId: 'custpage_salesorder'});
        for (var i = 0; i < lines; i++) {
            var quantity = page.getSublistValue({
                sublistId: 'custpage_salesorder',
                fieldId: 'custcol_agency_mf_media_quantity_1',
                line: i
            });
            if (quantity) {
                var field = page.getSublistField({
                    sublistId: 'custpage_salesorder',
                    fieldId: 'custcol_agency_mf_media_quantity_1',
                    line: i
                });
                 if (field) field.isDisabled = true;
            }
        }
    }

    // editlog structure
    // [{ 
    //     'id': transaction internal id, 
    //     'type': recType, 
    //     'lines': [{
    //         'index': index,
    //         'fieldId': value
    //          ...
    //     }],[{...}]
    // }],
    // [{...}]

    var editlog = [];
    var disableOnSave = [];
    function addToEditLog(sublistId, line, fieldId) {
        const id = getInternalId(sublistId, line);
        const index = page.getSublistValue({
            sublistId: sublistId,
            fieldId: 'line',
            line: line
        }) - 1;
        const value = page.getSublistValue({
            sublistId: sublistId,
            fieldId: fieldId,
            line: line
        });
        const recordIndex = editlog.findIndex(function(entry) {
            return (entry.id === id);
        });
        if (recordIndex === -1) { // make new record entry
            const newEntry = {id: id, type: sublistIdType(sublistId), lines: [{index: index}]};
            newEntry.lines[0][fieldId] = value;
            editlog.push(newEntry);
        } else { // add to existing record log
            const lineIndex = editlog[recordIndex].lines.findIndex(function(l) {
                return (l.index === index);
            });
            if (lineIndex === -1) { // make new line entry
                const newLine = {index: index};
                newLine[fieldId] = value;
                editlog[recordIndex].lines.push(newLine);
            } else { // add to existing line item fields
                editlog[recordIndex].lines[lineIndex][fieldId] = value;
            }
        }
    }
    function sublistIdType(sublistId) {
        if (sublistId === 'custpage_opportunity') return record.Type.OPPORTUNITY;
        if (sublistId === 'custpage_estimate') return record.Type.ESTIMATE;
        if (sublistId === 'custpage_salesorder') return record.Type.SALES_ORDER;
    }

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

        if (context.fieldId === 'custcol_agency_mf_media_quantity_1') {
            const soListId = context.sublistId;
            const soline = context.line;

            console.info('salesorder changed... ' + soListId + ' line# ' + soline);
            const value = page.getSublistValue({
                sublistId: soListId,
                fieldId: 'custcol_agency_mf_media_quantity_1',
                line: soline
            });
            const thisId = getInternalId(soListId, soline);
            // add to list of edited records for later save if nonzero value entered, otherwise ignore
            if (typeof value === 'number' && value > 0) {
                addToEditLog(soListId, soline, 'custcol_agency_mf_media_quantity_1');
                disableOnSave.push({
                    sublistId: soListId,
                    fieldId: 'custcol_agency_mf_media_quantity_1',
                    line: soline
                });
            } else {
                // don't disable if user made it a positive value, then changed to non positive value
                var removeIndex = disableOnSave.findIndex(function(field) {
                    return (field.sublistId === soListId
                        && field.fieldId === 'custcol_agency_mf_media_quantity_1'
                        && field.line === soline
                    );
                });
                if (removeIndex !== -1) disableOnSave.splice(removeIndex,1);
                // never let an update happen if not needed here
                const thisIndex = page.getSublistValue({
                    sublistId: soListId,
                    fieldId: 'line',
                    line: soline
                }) - 1;
                var editRecIndex = editlog.findIndex(function(entry) {
                    return entry.id === thisId;
                });
                if (editRecIndex !== -1) {
                    var editLineIndex = editlog[editRecIndex].lines.findIndex(function(l) {
                        return l.index === thisIndex;
                    });
                    if (editLineIndex !== -1) editlog[editRecIndex].lines.splice(editLineIndex,1);
                }
            }
        }

        // Updates for weighted and forecast calcs when line items change
        if (context.fieldId === 'custcolforecast_inclusion'
            || context.fieldId === 'probability' 
            || context.fieldId === 'amount') {
            
            const sublistId = context.sublistId;
            const line = context.line;

            console.info('forecast changed... ' + sublistId + ' line# ' + line);
            addToEditLog(sublistId, line, context.fieldId); // add to list of edited records for later save

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
                fieldId: 'custcolforecast_inclusion',
                line: line
            });
            if (context.fieldId === 'custcolforecast_inclusion') {
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

        filteredURL.searchParams.delete('worstcase');
        filteredURL.searchParams.delete('mostlikely');
        filteredURL.searchParams.delete('upside');

        window.location.replace(filteredURL);
    }

    var recordEdits = {};

    function save() {
        console.info('Saving Record Changes...');
        console.info(editlog);
        disableOnSave.forEach(function(field) {
            var fieldobj = page.getSublistField(field);
            fieldobj.isDisabled = true;
        });

        Promise.all(editlog.map(setTransactionRecordValues));

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
        recordEdits = {};
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

    function setTransactionRecordValues(recEntry) {
        const loaded = record.load.promise({
            type: recEntry.type,
            id: recEntry.id,
        });
        loaded.then(function(recObj){
            var probabilityUpdated = false;
            recEntry.lines.forEach(function(line) {
                Object.keys(line).forEach(function(fieldId) {
                    if (fieldId === 'probability' && !probabilityUpdated) {
                        recObj.setValue({
                            fieldId: 'probability',
                            value: line.probability,
                            ignoreFieldChange: true
                        });
                        probabilityUpdated = true;
                    } else if (fieldId === 'custcol_agency_mf_media_quantity_1') {
                        var mediaQuantity = line.custcol_agency_mf_media_quantity_1;
                        // update the item display
                        recObj.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_media_quantity_1',
                            line: line.index,
                            value: mediaQuantity
                        });
                        // build new media item sourced from transaction record
                        var mediaItem = record.create({type: 'customrecord_agency_mf_media'});
                        var lineId = recObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_line_id',
                            line: line.index
                        });
                        var flightEndDate = recObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_flight_end_date',
                            line: line.index
                        });
                        mediaItem.setValue({
                            fieldId: 'custrecord_agency_mf_delivery_date',
                            value: flightEndDate
                        });
                        mediaItem.setValue({
                            fieldId: 'custrecord_agency_mf_order',
                            value: recObj.id
                        });
                        mediaItem.setValue({
                            fieldId: 'custrecord_agency_mf_line_id',
                            value: lineId
                        });
                        mediaItem.setValue({
                            fieldId: 'custrecord_agency_mf_quantity_1',
                            value: mediaQuantity,
                        });
                        mediaItem.setValue({
                            fieldId: 'custrecord_agency_mf_fulfilled',
                            value: false
                        });
                        var mediaId = mediaItem.save();
                        console.log('created new media item : ' + mediaId);
                    } else {
                        recObj.setSublistValue({
                            sublistId: 'item',
                            fieldId: fieldId,
                            line: line.index,
                            value: line[fieldId]
                        });
                    }
                });
            });

            var recordId = recObj.save({ignoreMandatoryFields: true});
            console.info('Updated Transaction ID: ' + recordId);
        }).catch(function(reason) {
            console.info("Failed: " + reason);
            console.info('error name: ' + reason.name);
        });
        return;
    }

    exports.pageInit = pageInit;
    exports.performSearch = performSearch;
    exports.fieldChanged = fieldChanged;
    exports.save = save;

    return exports;
});
