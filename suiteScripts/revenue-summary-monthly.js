define([
    "N/search",
    "N/record",
    "N/runtime",
    "N/log"
], function (s, record, runtime, log) {

    /**
     * Backfill task to populate Revenue Summary records
     *
     * @exports revenue-summary-monthly
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
        { internalId: 1909, id: 'customsearch_legacy_print_3yr', summaryField: 'custrecord_legacy_print_3yr' },
        { internalId: 1916, id: 'customsearch_legacy_digital_3yr', summaryField: 'custrecord_legacy_digital_3yr'  },
        { internalId: 1917, id: 'customsearch_demand_gen_3yr', summaryField: 'custrecord_demand_gen_3yr'  },
        { internalId: 1918, id: 'customsearch_events_3yr', summaryField: 'custrecord_events_3yr'  },
        { internalId: 1919, id: 'customsearch_marketing_services_3yr', summaryField: 'custrecord_marketing_services_3yr'  },
        { internalId: 1920, id: 'customsearch_marketplace_3yr', summaryField: 'custrecord_marketplace_3yr'  },
        { internalId: 1910, id: 'customsearch_legacy_print_1yr', summaryField: 'custrecord_legacy_print_1yr' },
        { internalId: 1911, id: 'customsearch_legacy_digital_1yr', summaryField: 'custrecord_legacy_digital_1yr' },
        { internalId: 1912, id: 'customsearch_demand_gen_1yr', summaryField: 'custrecord_demand_gen_1yr' },
        { internalId: 1913, id: 'customsearch_events_1yr', summaryField: 'custrecord_events_1yr' },
        { internalId: 1914, id: 'customsearch_marketing_services_1yr', summaryField: 'custrecord_marketing_services_1yr' },
        { internalId: 1915, id: 'customsearch_marketplace_1yr', summaryField: 'custrecord_marketplace_1yr' },
        { internalId: 1908, id: 'customsearch_legacy_print_mo', summaryField: 'custrecord_legacy_print_mo' },
        { internalId: 1921, id: 'customsearch_legacy_digital_mo', summaryField: 'custrecord_legacy_digital_mo' },
        { internalId: 1922, id: 'customsearch_demand_gen_mo', summaryField: 'custrecord_demand_gen_mo' },
        { internalId: 1923, id: 'customsearch_events_mo', summaryField: 'custrecord_events_mo' },
        { internalId: 1924, id: 'customsearch_marketing_services_mo', summaryField: 'custrecord_marketing_services_mo' },
        { internalId: 1925, id: 'customsearch_marketplace_mo', summaryField: 'custrecord_marketplace_mo' },
    ];

    function execute() {
        log.audit({title: 'Running Revenue Summary Monthly...'});

        let summaryTotals = {};
        summarySearches.forEach(sumSearch => {
            log.debug('running search ' + sumSearch.id);
            s.load({id: sumSearch.id}).run().each(res => {
                let summaryId = res.getValue({
                    name: 'custrecord_rev_parent',
                    summary: s.Summary.GROUP
                });
                if (!summaryId) return; // skip the grand total
                let totalSold = res.getValue({
                    name: 'custrecord_revenue_forecast_sold',
                    summary: s.Summary.SUM
                });
                if (summaryTotals[summaryId] == undefined) summaryTotals[summaryId] = {};
                if (totalSold) summaryTotals[summaryId][sumSearch.summaryField] = totalSold;
                return true;
            });
        })

        for (summaryRecord in summaryTotals) {
            log.debug({
                title: 'Submit Summary Record  ' + summaryRecord,
                details: JSON.stringify(summaryTotals[summaryRecord])
            });
            record.submitFields({
                type: 'customrecord_revenue_summary',
                id: summaryRecord,
                values: summaryTotals[summaryRecord]
            });
        }
        const scriptObj = runtime.getCurrentScript();
        log.audit({title: 'Script completed with remaining governance', details: scriptObj.getRemainingUsage()});
        
        return; 
    }

    exports.execute = execute;
    return exports;
});