define(["N/currentRecord"], function (cr) {

    /**
     * Client Script to perform search in forecast suitelet
     *
     * @exports sandbox-forecast/cl
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     * 
     * @requires N/currentRecord
     * 
     * @NApiVersion 2.x
     * @NScriptType ClientScript
     */
    var exports = {};
    const page = cr.get();

    function pageInit() {
        window.onbeforeunload = null;
    };


    function fieldChanged(context) {
        console.info("fieldChanged...");
        if (context.fieldId == 'custpage_startdate') {
            console.info("startFieldChanged...");
            const startdate = page.getValue({fieldId: 'custpage_startdate'});
            const date = new Date(startdate);
            const enddate = new Date(startdate.getFullYear(), date.getMonth() + 1, 0);

            page.setValue({
                fieldId: 'custpage_enddate',
                value: enddate
            });
        }
    };

    function performSearch() {
        const page = cr.get();
        console.info("Performing Forecast Search...");

        const salesrep = page.getValue({fieldId: 'custpage_salesrep'});
        const property = page.getValue({fieldId: 'custpage_property'});
        const startdate = page.getValue({fieldId: 'custpage_startdate'});
        const enddate = page.getValue({fieldId: 'custpage_enddate'});

        const filteredURL = new URL(document.location.href);

        filteredURL.searchParams.set('salesrep', salesrep);
        filteredURL.searchParams.set('property', property);
        filteredURL.searchParams.set('startdate', startdate);
        filteredURL.searchParams.set('enddate', enddate);

        window.location.replace(filteredURL);
    };

    exports.pageInit = pageInit;
    exports.performSearch = performSearch;
    exports.fieldChanged = fieldChanged;

    return exports;
});
