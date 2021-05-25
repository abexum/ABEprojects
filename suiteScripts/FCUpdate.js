
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

    const setTransactionRecordValues = async (recEntry) => {
        try {
            const recObj = record.load({
                type: recEntry.type,
                id: recEntry.id,
            });
            var probabilityUpdated = false;
            log.debug({title: 'recEntry Object', details: JSON.stringify(recEntry)});
            recEntry.lines.forEach(function(line) {
                Object.keys(line).forEach(function(fieldId) {
                    if (fieldId === 'index') return;
                    if (fieldId === 'probability' && !probabilityUpdated) {
                        recObj.setValue({
                            fieldId: 'probability',
                            value: line.probability,
                            ignoreFieldChange: true
                        });
                        probabilityUpdated = true;
                    } else if (fieldId === 'custcol_agency_mf_media_quantity_1') {
                        var currentMediaQuantity = recObj.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_agency_mf_media_quantity_1',
                            line: line.index
                        });
                        // do not update if there is an existing media quantity
                        if (currentMediaQuantity) return;
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
                        var mediaId = mediaItem.save({ignoreMandatoryFields: true});
                        log.audit('created new media item : ' + mediaId);
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