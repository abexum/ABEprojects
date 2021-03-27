define(["N/url", "N/currentRecord", "N/runtime"], function (url, cr, rt) {

    /**
     * Client Script to perform search in forecast suitelet
     *
     * @exports sandbox-forecast/cl
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     * 
     * @requires N/url
     * @requires N/currentRecord
     * @requires N/runtime
     * 
     * @NApiVersion 2.x
     * @NModuleScope SameAccount
     */
    var exports = {};

    function performSearch() {
        console.info("Performing Forecast Search...");

        const page = cr.get();
        // TODO make these pull the selected value and not the default
        const salesrepfilter = page.getValue({fieldId: 'custpage_salesrep'});
        const propertyfilter = page.getValue({fieldId: 'custpage_property'});
        const startDate = page.getValue({fieldId: 'custpage_startdate'});
        const endDate = page.getValue({fieldId: 'custpage_enddate'});


        // const scriptObj = rt.getCurrentScript();

        // const salesrepfilter = scriptObj.getParameter({name: 'custpage_salesrep'});
        // const propertyfilter = scriptObj.getParameter({name: 'custpage_property'});
        // const startDate = scriptObj.getParameter({name: 'custpage_startdate'});
        // const endDate = scriptObj.getParameter({name: 'custpage_enddate'});

        const filteredURL = new URL(document.location.href);

        window.onbeforeunload = null;
        window.location.replace(filteredURL+'&salesrep='+salesrepfilter+'&property='+propertyfilter+'&startdate='+startDate+'&enddate='+endDate);
    };

    exports.performSearch = performSearch;
    return exports;
});
