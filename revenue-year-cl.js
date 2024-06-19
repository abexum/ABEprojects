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
        jQuery('#div__body > table.uir-table-block > tbody > tr:nth-child(1)').css('display',  'none');
        const submitButton = jQuery('#custpage_year_advertisers_layer > div > div.uir-list-control-bar > table > tbody > tr > td');
        submitButton.css('display', 'flex')
        submitButton.css('justify-content', 'flex-end');
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

    function createEditLog() {
        const sublistId = 'custpage_year_advertisers';

        const fullList = page.getSublist({sublistId: sublistId});
        console.log(JSON.stringify(fullList));

        const numLines = page.getLineCount({sublistId: sublistId});

        for (var line = 0; line < numLines; line++) {
            var reviewBox = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'reviewbox',
                line: line
            });

            if (!reviewBox) continue;
            console.log('submitting line : ' + line);
            const yearId = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'scriptid',
                line: line
            });
            var pitch = page.getSublistValue({
                sublistId: sublistId,
                fieldId: 'custrecord_rev_pitch_total',
                line: line
            });
            editfields.push({
                sublistId: sublistId,
                fieldId: 'custrecord_rev_pitch_total',
                line: line,
                value: pitch,
            });

            var newEntry = {
                id: yearId, 
                type: 'customrecord_revenue_year',
                custrecord_rev_pitch_total: pitch
            };

            setGroupValues(sublistId, newEntry, line, 
                'custrecord_rev_year_perc_legacy_print', 
                'custrecord_rev_year_legacy_print');
            setGroupValues(sublistId, newEntry, line, 
                'custrecord_rev_year_perc_legacy_digital', 
                'custrecord_rev_year_legacy_digital');
            setGroupValues(sublistId, newEntry, line, 
                'custrecord_rev_year_perc_demand_gen', 
                'custrecord_rev_year_demand_gen');    
            setGroupValues(sublistId, newEntry, line, 
                'custrecord_rev_year_perc_events', 
                'custrecord_rev_year_events');
            setGroupValues(sublistId, newEntry, line, 
                'custrecord_rev_year_perc_marketing_serv', 
                'custrecord_rev_year_marketing_services');
            setGroupValues(sublistId, newEntry, line, 
                'custrecord_rev_year_perc_marketplace', 
                'custrecord_rev_year_marketplace');
            
            editlog.push(newEntry);

            console.log('pitch : ' + pitch);
            console.log(JSON.stringify(newEntry));
        }
    }

    function setGroupValues(sublistId, entry, line, percId, amountId) {
        var pitch = entry.custrecord_rev_pitch_total;
        var percent = page.getSublistValue({
            sublistId: sublistId,
            fieldId: percId,
            line: line
        });
        var amount = (pitch*(percent/100)).toFixed(2);
        entry[percId] = percent;
        entry[amountId] = amount;

        editfields.push({
            sublistId: sublistId,
            fieldId: percId,
            line: line,
            value: percent,
        });
    }

    function fieldChanged(context) {
        if (context.fieldId === 'custpage_year') {
            console.info("datesChanged...");
            var year = parseInt(page.getValue({fieldId: 'custpage_year'})) || 0;
            if (year < 2000 || year > 3000) {
                const today = new Date();
                year = parseInt(today.getFullYear());
            }
            page.setValue({
                fieldId: 'custpage_year',
                value: year,
                ignoreFieldChange: true
            });
        }
    }

    function performSearch() {
        const page = cr.get();
        console.info('Performing Forecast Search...');

        const salesrep = page.getValue({fieldId: 'custpage_salesrep'});
        const year = page.getValue({fieldId: 'custpage_year'});

        const filteredURL = new URL(document.location.href);

        filteredURL.searchParams.set('salesrep', salesrep);
        filteredURL.searchParams.set('year', year);

        window.location.replace(filteredURL);
    }

    function save() {
        console.info('Saving Record Changes...');
        createEditLog();
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

    exports.pageInit = pageInit;
    exports.performSearch = performSearch;
    exports.fieldChanged = fieldChanged;
    exports.save = save;

    return exports;
});