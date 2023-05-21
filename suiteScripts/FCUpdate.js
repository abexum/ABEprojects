
define(["N/runtime", "N/record", "N/log"],
function (runtime, record, log) {

    /**
     * Update task for record changes and fulfillment in sales-forecast scripts
     *
     * @exports FCUpdate
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/runtime
     * @requires N/record
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
     * @return {void}
     *
     * @static
     * @function execute
     */

    function execute() {
        log.audit({title: 'Running Forecast Update Task...'});

        const editlog = runtime.getCurrentScript().getParameter({name: 'custscript_fcupdate_editlog'});
        log.debug({title: 'full editlog', details: editlog});
        JSON.parse(editlog).map(setTransactionRecordValues);

        log.audit({
            title: 'record updates complete'
        });
    }

    // recEntry Object = {
    // 'id': transaction internal id, 
    // 'type': recType, 
    // 'lines': [{
    //     'index': index,
    //     'fieldId': value
    //      ...
    //      }, { ... } ... ]
    // }

    const setTransactionRecordValues = (recEntry) => {
        try {
            const recObj = record.load({
                type: recEntry.type,
                id: recEntry.id,
                isDynamic: true,
            });
            let probabilityUpdated = false;
            log.debug({title: 'recEntry Object', details: JSON.stringify(recEntry)});
            recEntry.lines.forEach(function(line) {
                let lineSelected = false;
                // line.index is the 'line' item sublist field.  we need linenumber - 1
                let lineNumber = recObj.findSublistLineWithValue({
                    sublistId: 'item',
                    fieldId: 'line',
                    value: line.index
                });
                if (lineNumber !== -1){
                    recObj.selectLine({
                        sublistId: 'item',
                        line: lineNumber
                    });
                    lineSelected = true;
                }

                Object.keys(line).forEach((fieldId) => {
                    if (fieldId === 'index') return;
                    if (fieldId === 'probability' && !probabilityUpdated) {
                        recObj.setValue({
                            fieldId: 'probability',
                            value: line.probability,
                            ignoreFieldChange: true
                        });
                        probabilityUpdated = true;
                    } else if (fieldId === 'custcol_agency_mf_media_quantity_1') {
                        if (!lineSelected) return;
                        var currentMediaQuantity = recObj.getCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_media_quantity_1'
                        });
                        // do not update if there is an existing media quantity
                        if (currentMediaQuantity) return;
                        var mediaQuantity = line.custcol_agency_mf_media_quantity_1;
                        // update the item display
                        recObj.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_media_quantity_1',
                            value: mediaQuantity,
                            ignoreFieldChange: true
                        });
                        // build new media item sourced from transaction record
                        var mediaItem = record.create({type: 'customrecord_agency_mf_media'});
                        var lineId = recObj.getCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_line_id'
                        });
                        var flightEndDate = recObj.getCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_flight_end_date',
                        });
                        mediaItem.setValue({
                            fieldId: 'custrecord_agency_mf_delivery_date',
                            value: flightEndDate
                        });
                        // TODO a search for these two values to avoid creating a duplicate
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
                        var mediaId = mediaItem.save({ ignoreMandatoryFields: true });
                        log.audit('created new media item : ' + mediaId);
                    } else {
                        if (!lineSelected) return;
                        recObj.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: fieldId,
                            value: line[fieldId],
                            ignoreFieldChange: true
                        });
                    }
                });
                if (lineSelected) recObj.commitLine({ sublistId: 'item' });
            });
            log.debug({
                title: 'remaining governance before save recId: ' + recObj.id,
                details: runtime.getCurrentScript().getRemainingUsage()
            });
            // Add safegaurds such that media items ARE NOT CREATED when this save would fail
            var recordId = recObj.save({ignoreMandatoryFields: true});
            log.audit({ title: 'Updated Transaction Record', details:  recordId });
        } catch (error) {
            log.error({
                title: 'Record update failure... ' + recEntry.type + ' : ' + recEntry.id,
                details: error
            });
        }
    }
    exports.execute = execute;
    return exports;
});