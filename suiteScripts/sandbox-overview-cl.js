define(['N/currentRecord', 'N/record'], function(cr, record) {

    /**
     * Client Script to refresh view in forecast overview suitelet
     *
     * @exports sandbox-overview/cl
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

    function fieldChanged(context) {

        if (context.fieldId === 'custpage_startdate') {
            console.info("datesChanged...");
            var startdate = page.getValue({fieldId: 'custpage_startdate'});
            const date = new Date(startdate);

            startdate = new Date(startdate.getFullYear(), date.getMonth(), 1);

            page.setValue({
                fieldId: 'custpage_startdate',
                value: startdate,
                ignoreFieldChange: true
            });
        }
    }

    function refreshView() {
        const page = cr.get();
        console.info('Refreshing Forecast Overview...');

        const salesrep = page.getValue({fieldId: 'custpage_salesrep'});
        const property = page.getValue({fieldId: 'custpage_property'});
        const startdate = page.getValue({fieldId: 'custpage_startdate'});
        const displayvalue = page.getValue({fieldId: 'custpage_displayvalue'});

        const filteredURL = new URL(document.location.href);

        filteredURL.searchParams.set('salesrep', salesrep);
        filteredURL.searchParams.set('property', property);
        filteredURL.searchParams.set('startdate', startdate);
        filteredURL.searchParams.set('displayvalue', displayvalue);

        window.location.replace(filteredURL);
    }

    function getIDfromHTML(html){
        const params = html.substring(html.indexOf('id='));
        return params.substring(3,params.indexOf('&'));
    }




    exports.pageInit = pageInit;
    exports.refreshView = refreshView;
    exports.fieldChanged = fieldChanged;

    return exports;
});