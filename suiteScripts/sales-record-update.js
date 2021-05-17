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