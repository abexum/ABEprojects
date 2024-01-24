define(['N/currentRecord', 'N/record'], function(cr, record) {

    /**
     * Client Script to perform search and save values in revenue year suitelet
     *
     * @exports revenue-year/cl
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

    // editlog structure
    // [{ 
    //     'id': transaction internal id, 
    //     'type': recType, 
    //     'lines': [{
    //         'index': index,
    //         'fieldId': value
    //          ...
    //     }, {...}, ... ]
    // },
    // {...}, ... ]

    var editlog = [];
    var editfields = [];

    function addToEditLog(sublistId, line, fieldId) {
        
        const id = getInternalId(sublistId, line);
        console.info('edit log internalId : ' + id);
        const value = page.getSublistValue({
            sublistId: sublistId,
            fieldId: fieldId,
            line: line
        });

        // editlog for FCUpdate script on save page refresh

        const recordIndex = editlog.findIndex(function(entry) {
            return (entry.id === id);
        });

        if (recordIndex === -1) { // make new record entry
            const newEntry = {id: id, type: 'customrecord_revenue_year'};
            
            // TODO add the rep, prop, date, group, advertiser to the edit log
            if (typeof id === 'string' || id instanceof String) {
                const startdate = page.getValue({fieldId: 'custpage_startdate'});
                const jsDate = new Date(startdate)
    
                const year = parseInt(jsDate.getFullYear());
                const advertiserURL = page.getSublistValue({
                    sublistId: sublistId,
                    fieldId: 'custrecord_revenue_forecast_advertiser',
                    line: line
                });
                const advertiser = getIDfromHTML(advertiserURL);

                newEntry['custrecord_rev_year'] = year;
                newEntry['custrecord_revenue_year_advertiser'] = advertiser;  
            }

            newEntry[fieldId] = value;
            editlog.push(newEntry);
        } else { // add to existing record log
            editlog[recordIndex][fieldId] = value;
        }

        addToEditFields(sublistId, line, fieldId, value)
    }

    function addToEditFields(sublistId, line, fieldId, value) {
        // field edits for UI on save page refresh
        var fieldIndex = editfields.findIndex(function(field) {
            return (field.sublistId === sublistId
                && field.fieldId === fieldId
                && field.line === line
            );
        });

        // ui components use string instead of boolean
        var fieldValue = value;
        if (typeof value === "boolean") fieldValue = (value) ? 'T' : 'F';
        if (fieldIndex === -1) { // make new field entry
            editfields.push({
                sublistId: sublistId,
                fieldId: fieldId,
                line: line,
                value: fieldValue,
            });
        } else { // set the new value to the field log
            editfields[fieldIndex].value = fieldValue;
        }
    }

    function fieldChanged(context) {
        if (context.fieldId === 'custpage_startdate') {
            console.info("datesChanged...");
            var startdate = page.getValue({fieldId: 'custpage_startdate'});
            startdate = new Date(startdate.getFullYear(), 0, 1);

            page.setValue({
                fieldId: 'custpage_startdate',
                value: startdate,
                ignoreFieldChange: true
            });
        }

        // Updates for weighted and forecast calcs when line items change
        // if (context.fieldId === 'custrecord_revenue_forecast_forecasted'
        //     || context.fieldId === 'custrecord_revenue_forecast_probability') {
            
        //     const sublistId = context.sublistId;
        //     const line = context.line;

        //     console.info('forecast changed... ' + sublistId + ' line# ' + line + ' fieldId ' + context.fieldId);
        //     addToEditLog(sublistId, line, context.fieldId); // add to list of edited records for later save

        //     // Now update the Projected
        //     const sold = page.getSublistValue({
        //         sublistId: sublistId,
        //         fieldId: 'custrecord_rev_booked_total',
        //         line: line
        //     });
        //     const forecasted = page.getSublistValue({
        //         sublistId: sublistId,
        //         fieldId: 'custrecord_rev_pitch_total',
        //         line: line
        //     });
        //     const oldProjected = page.getSublistValue({
        //         sublistId: sublistId,
        //         fieldId: 'custrecord_revenue_forecast_projected',
        //         line: line
        //     });
        //     const probability = page.getSublistValue({
        //         sublistId: sublistId,
        //         fieldId: 'custrecord_revenue_forecast_probability',
        //         line: line
        //     });

        //     const probnum = (parseFloat(probability)/100);

        //     const projected = sold + (forecasted*probnum);

        //     // update projected
        //     page.selectLine({sublistId: sublistId, line: line});
        //     page.setCurrentSublistValue({
        //         sublistId: sublistId,
        //         fieldId: 'custrecord_revenue_forecast_projected',
        //         value: projected,
        //         ignoreFieldChange: true
        //     });
        //     page.commitLine({sublistId: sublistId});
        //     addToEditFields(sublistId, line, 'custrecord_revenue_forecast_projected', projected.toFixed(2));

        //     updateTotals(oldProjected, projected);
        // }
    }

    function updateTotals(oldProjected, newProjected) {
        const oldTotalProjected = page.getValue({fieldId: 'custpage_projected'});
        //console.info('type of stuff ' + typeof oldProjected + typeof newProjected + typeof oldTotalProjected);
        const newTotalProjected = oldTotalProjected + (newProjected - oldProjected);
        //console.info('type of new total ' + typeof newTotalProjected);
        page.setValue({fieldId: 'custpage_projected', value: newTotalProjected.toFixed(2)});
    }

    function performSearch() {
        const page = cr.get();
        console.info('Performing Forecast Search...');

        const salesrep = page.getValue({fieldId: 'custpage_salesrep'});
        const startdate = page.getValue({fieldId: 'custpage_startdate'});

        const filteredURL = new URL(document.location.href);

        filteredURL.searchParams.set('salesrep', salesrep);
        filteredURL.searchParams.set('startdate', startdate);

        window.location.replace(filteredURL);
    }

    function save() {
        console.info('Saving Record Changes...');
        console.info(editlog);

        const filteredURL = new URL(document.location.href);

        // make the updatelog record for the update scheduled script, pass id as url param to the server suitlet
        if (editlog.length) {
            const updatelogid = buildUpdateLog();
            console.info('updatelog id : ' + updatelogid);
            filteredURL.searchParams.set('updatelogid', updatelogid);
        }

        window.location.replace(filteredURL);
    }

    function buildUpdateLog() {
        var logRecord = record.create({
            type: 'customrecord_fcupdate_log',
        });
        // set values
        logRecord.setValue('name', 'Temp_UpdateLog_revenue-year-cl');
        logRecord.setValue({
            fieldId: 'custrecord_fcupdate_editlog',
            value: JSON.stringify(editlog)
        });
        logRecord.setValue({
            fieldId: 'custrecord_fcupdate_editfields',
            value: JSON.stringify(editfields)
        });
        return logRecord.save();
    }

    function getInternalId(sublistId, line) {
        const revenue_record_id = page.getSublistValue({
            sublistId: sublistId,
            fieldId: 'scriptid',
            line: line
        });
        if (revenue_record_id == 0) {
            var newRecId = 'new_record_';
            newRecId += line;
            return newRecId;
        }
        return revenue_record_id;
    }

    function getIDfromHTML(html){
        const params = html.substring(html.indexOf('id='));
        return params.substring(3,params.indexOf('&'));
    }

    exports.pageInit = pageInit;
    exports.performSearch = performSearch;
    exports.fieldChanged = fieldChanged;
    exports.save = save;

    return exports;
});