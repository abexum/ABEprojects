define([
    "N/search",
    "N/record",
    "N/runtime",
    "N/log"
], function (s, record, runtime, log) {

    /**
     * Backfill task to populate Revenue Year records
     *
     * @exports revenue-summary-yearly
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/file
     * @requires N/runtime
     * @requires N/task
     * @requires N/log
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
     * @param context
     *        {Object}
     *
     * @return {void}
     *
     * @static
     * @function execute
     */

    const summarySearches = [
        { internalId: 1933, id: 'customsearch_rev_summary_advertisers', summaryField: 'custrecord_rev_three_year_total' },
        { internalId: 1934, id: 'customsearch_rev_booked_this_yr', summaryField: 'custrecord_rev_booked_total'  },
        { internalId: 1935, id: 'customsearch_rev_booked_next_yr', summaryField: 'custrecord_rev_booked_total'  },
        { internalId: 1936, id: 'customsearch_rev_booked_last_yr', summaryField: 'custrecord_rev_booked_total'  }
    ];

    const yearTotals = {};
    const idLibrary = {};

    function execute() {
        log.audit({title: 'Running Revenue Summary Monthly...'});

        const today = new Date();
        let year = parseInt(today.getFullYear());
        let searchId = 'customsearch_rev_booked_this_yr'
        if (today.getMonth() > 9) {
            year++; // do next year if november +
            searchId = 'customsearch_rev_booked_next_yr';
        }

        s.load({id: 'customsearch_rev_summary_advertisers'}).run().each(res => {
            let clientId = res.getValue({
                name: 'custrecord_rev_sum_primary_adv',
                summary: s.Summary.GROUP
            });
            if (!clientId) return; // skip the grand total
            let legacyPrint = parseFloat(res.getValue({
                name: 'custrecord_legacy_print_3yr',
                summary: s.Summary.SUM
            }));
            let legacyDigital = parseFloat(res.getValue({
                name: 'custrecord_legacy_digital_3yr',
                summary: s.Summary.SUM
            }));
            let demandGen = parseFloat(res.getValue({
                name: 'custrecord_demand_gen_3yr',
                summary: s.Summary.SUM
            }));
            let events = parseFloat(res.getValue({
                name: 'custrecord_events_3yr',
                summary: s.Summary.SUM
            }));
            let marketingServices = parseFloat(res.getValue({
                name: 'custrecord_marketing_services_3yr',
                summary: s.Summary.SUM
            }));
            let marketplace = parseFloat(res.getValue({
                name: 'custrecord_marketplace_3yr',
                summary: s.Summary.SUM
            }));
            let total = legacyPrint
                + legacyDigital
                + demandGen
                + events
                + marketingServices
                + marketplace;
            
            if (yearTotals[clientId] == undefined) {
                yearTotals[clientId] = {};
                yearTotals[clientId][year] = {};
            }
            // set 3yr for update always
            yearTotals[clientId][year]['custrecord_rev_three_year_total'] = total;
            if (total) {
                // year is not used here, we do not want old records to update the %s
                // these values are placeholders to aid in pitch forecast for sales reps
                yearTotals[clientId]['custrecord_rev_year_perc_legacy_print'] = ((legacyPrint/total)*100).toFixed(2);
                yearTotals[clientId]['custrecord_rev_year_perc_legacy_digital'] = ((legacyDigital/total)*100).toFixed(2);
                yearTotals[clientId]['custrecord_rev_year_perc_demand_gen'] = ((demandGen/total)*100).toFixed(2);
                yearTotals[clientId]['custrecord_rev_year_perc_events'] = ((events/total)*100).toFixed(2);
                yearTotals[clientId]['custrecord_rev_year_perc_marketing_serv'] = ((marketingServices/total)*100).toFixed(2);
                yearTotals[clientId]['custrecord_rev_year_perc_marketplace'] = ((marketplace/total)*100).toFixed(2);
            }
            return true;
        });

        fillYearTotal();
        getExistingRecords();

        for (advertiser in yearTotals) {
            updateCreateRevYear(advertiser);
        }

        function fillYearTotal() {
            s.load({id: searchId}).run().each(res => {
                let clientId = res.getValue({
                    name: 'custrecord_revenue_forecast_advertiser',
                    summary: s.Summary.GROUP
                });
                // log.debug({
                //     title: 'result JSON for client id ' +  clientId, 
                //     details: JSON.stringify(res)
                // });

                if (!clientId) return; // skip the grand total

                let booked = res.getValue({
                    name: 'custrecord_revenue_forecast_sold',
                    summary: s.Summary.SUM
                });
                // log.debug({
                //     title: 'booked for client id ' +  clientId, 
                //     details: booked
                // });

                if (yearTotals[clientId] == undefined) {
                    yearTotals[clientId] = {};
                    yearTotals[clientId][year] = {};
                }
                yearTotals[clientId][year]['custrecord_rev_booked_total'] = booked;
                return true;
            });
        }

        function getExistingRecords() {
            let searchFilter = [];

            const yrFilter = s.createFilter({
                name: 'custrecord_rev_year',
                operator: s.Operator.EQUALTO,
                values: year
            });
            searchFilter.push(yrFilter);

            s.create({
                type: 'customrecord_revenue_year',
                columns: ['custrecord_rev_year_advertiser', 'custrecord_rev_pitch_total'],
                filters: searchFilter
            }).run().each(res => {
                let pitch = res.getValue({name: 'custrecord_rev_pitch_total'});
                let advertiser = res.getValue({name: 'custrecord_rev_year_advertiser'});

                if (idLibrary[advertiser] == undefined) idLibrary[advertiser] = {};

                idLibrary[advertiser][year] = res.id;
                // log.debug({
                //     title: 'pitch for ' + res.getText({name: 'custrecord_rev_year_advertiser'}), 
                //     details: advertiser + ' ... ' + pitch
                // });
                if (!pitch) { // set %s for update since no pitch
                    yearTotals[advertiser][year]['custrecord_rev_year_perc_legacy_print'] = yearTotals[advertiser]['custrecord_rev_year_perc_legacy_print'];
                    yearTotals[advertiser][year]['custrecord_rev_year_perc_legacy_digital'] = yearTotals[advertiser]['custrecord_rev_year_perc_legacy_digital'];
                    yearTotals[advertiser][year]['custrecord_rev_year_perc_demand_gen'] = yearTotals[advertiser]['custrecord_rev_year_perc_demand_gen'];
                    yearTotals[advertiser][year]['custrecord_rev_year_perc_events'] = yearTotals[advertiser]['custrecord_rev_year_perc_events'];
                    yearTotals[advertiser][year]['custrecord_rev_year_perc_marketing_serv'] = yearTotals[advertiser]['custrecord_rev_year_perc_marketing_serv'];
                    yearTotals[advertiser][year]['custrecord_rev_year_perc_marketplace'] = yearTotals[advertiser]['custrecord_rev_year_perc_marketplace'];
                }
                return true;
            });
        }

        function updateCreateRevYear(client) {
            if (idLibrary[client] !== undefined && idLibrary[client][year] !== undefined) {
                // update the existing record
                record.submitFields({
                    type: 'customrecord_revenue_year',
                    id: idLibrary[client][year],
                    values: yearTotals[client][year]
                });

                return;
            }
            let yearRecord = record.create({type: 'customrecord_revenue_year'});
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year',
                value: year
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_advertiser',
                value: client
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_three_year_total',
                value: yearTotals[client][year]['custrecord_rev_three_year_total']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_booked_total',
                value: yearTotals[client][year]['custrecord_rev_booked_total']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_perc_legacy_print',
                value: yearTotals[client]['custrecord_rev_year_perc_legacy_print']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_perc_legacy_digital',
                value: yearTotals[client]['custrecord_rev_year_perc_legacy_digital']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_perc_demand_gen',
                value: yearTotals[client]['custrecord_rev_year_perc_demand_gen']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_perc_events',
                value: yearTotals[client]['custrecord_rev_year_perc_events']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_perc_marketing_serv',
                value: yearTotals[client]['custrecord_rev_year_perc_marketing_serv']
            });
            yearRecord.setValue({
                fieldId: 'custrecord_rev_year_perc_marketplace',
                value: yearTotals[client]['custrecord_rev_year_perc_marketplace']
            });

            yearRecord.save();
        }

        const scriptObj = runtime.getCurrentScript();
        log.audit({title: 'Script completed with remaining governance', details: scriptObj.getRemainingUsage()});
        
        return;
    }

    exports.execute = execute;
    return exports;
});