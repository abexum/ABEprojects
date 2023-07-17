define([
    "N/search",
    "N/url",
    "N/task",
    "N/format",
    "N/ui/serverWidget",
    "N/record",
    "N/log",
    "../sales-forecast/FCUtil"
], function (s, url, task, format, ui, record, log, FCUtil) {

    /**
     * Revenue Forecast Suitelet: Improved revenue forecaster for ACBM
     *
     * @exports revenue-forecast
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/url
     * @requires N/task
     * @requires N/format
     * @requires N/ui/serverWidget
     * @requires N/record
     * @requires N/log
     *
     * @NApiVersion 2.1
     * @NModuleScope SameAccount
     * @NScriptType Suitelet
     */
    const exports = {};

    /**
     * <code>onRequest</code> event handler
     *
     * @param context
     *        {Object}
     * @param context.request
     *        {ServerRequest} The incoming request object
     * @param context.response
     *        {ServerResponse} The outgoing response object
     *
     * @return {void}
     *
     * @static
     * @function onRequest
     */

    const forecastFields = [
        {
            id: 'custrecord_revenue_forecast_advertiser',
            label: 'Primary Advertiser',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'custrecord_revenue_forecast_sold',
            label: 'Sold',
            type: ui.FieldType.CURRENCY
        },
        { 
            id: 'custrecord_revenue_forecast_forecasted',
            label: 'Forecasted',
            type: ui.FieldType.CURRENCY
        },
        { 
            id: 'custrecord_revenue_forecast_probability',
            label: 'Probability',
            type: ui.FieldType.PERCENT
        },
        { 
            id: 'custrecord_revenue_forecast_projected',
            label: 'Projected',
            type: ui.FieldType.CURRENCY
        },
        {
            id: 'scriptid',
            label: 'revenue forecast record',
            type: ui.FieldType.INTEGER
        }
    ];

    var editedFields = [];

    const productGroups = [];
    const advertiserIndex = {};
    const calcs = {};

    var salesrepResultList = []
    var propertyResultList = []

    function onRequest(context) {
        log.audit({title: 'Loading Revenue Suitelet...'});
        log.debug({title: 'request parameters', details: context.request.parameters});

        let displayTitle = 'Revenue Forecast Tool';
        // if (adminUser()) displayTitle = 'Sales Forecast & Order Fulfillment';
        // if (fulfillmentUser()) displayTitle = 'Order Fulfillment';
        // if (salesRepUser()) displayTitle = 'Sales Forecast';

        const page = ui.createForm({
            title: displayTitle
        });

        let filter = getFilter(context.request);
        filterOptionsSection(page, filter);
        // TODO use better
        if (!filter.salesrep) filter.salesrep = salesrepResultList[0].id;
        if (!filter.property) filter.property = propertyResultList[0].id;

        page.clientScriptModulePath = "./revenue-forecast-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Update Filters',
            functionName: 'performSearch'
        });
        let saveButton = page.addButton({
            id : 'custpage_saveButton',
            label : 'Save',
            functionName: 'save'
        });  
        //saveButton.isDisabled = true;

        fillProductGroups();

        emptyAdvertiserIndex(filter);

        // log.debug({title: 'emptyIndex', details: JSON.stringify(advertiserIndex)});

        fillAdvertiserIndex(filter);

        // log.debug({title: 'filledIndex', details: JSON.stringify(advertiserIndex)});

        // run searches that build sublists in display
        productGroups.forEach(group => {
            renderList(page, group);
        });

        context.response.writePage({
            pageObject: page
        });
    }

    function filterOptionsSection(page, filter) {
        const filtergroup = page.addFieldGroup({
            id : 'custpage_filtergroup',
            label : 'Filter Results'
        });
        filtergroup.isBorderHidden = true;

        const salesRepSearchField = page.addField({
            id: 'custpage_salesrep',
            label: 'Sales Rep',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        salesrepResultList = FCUtil.getSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        propertyResultList = FCUtil.getProperties(propertySearchField, filter.property);

        const startDateField = page.addField({
            id: 'custpage_startdate',
            label: 'Start Date',
            type: ui.FieldType.DATE,
            container: 'custpage_filtergroup'
        });
        startDateField.updateBreakType({
            breakType : ui.FieldBreakType.STARTCOL
        });
        startDateField.defaultValue = filter.startdate;

        const endDateField = page.addField({
            id: 'custpage_enddate',
            label: 'End Date',
            type: ui.FieldType.DATE,
            container: 'custpage_filtergroup'
        });
        endDateField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        endDateField.defaultValue = filter.enddate;
    }

    function fillProductGroups() {
        let groupListRecord = record.load({type: 'customlist', id: 703});

        const dupedRecord = JSON.parse(JSON.stringify(groupListRecord));
        // log.debug({title: 'product group custom list record', details: JSON.stringify(dupedRecord.sublists.customvalue)});

        Object.keys(dupedRecord.sublists.customvalue).forEach(key => {
            if (dupedRecord.sublists.customvalue[key].isinactive == 'F') {
                // log.debug({
                //     title: 'search result col name in custom list', 
                //     details: dupedRecord.sublists.customvalue[key].value
                // });
                let pgID = dupedRecord.sublists.customvalue[key].valueid;
                let pgName = dupedRecord.sublists.customvalue[key].value;
                productGroups.push({
                    id: pgID,
                    name: pgName
                });
                calcs[pgID] = {};
                calcs[pgID].sold = 0;
                calcs[pgID].forecasted = 0;
                calcs[pgID].projected = 0;
            }
        });
    }

    function emptyAdvertiserIndex(filter) {
        const { salesrep, property } = filter;
        s.create({
            type: s.Type.CUSTOMER,
            columns: ['companyname'],
            filters: [['subsidiary', s.Operator.ANYOF, ['2']], 'and',  
                ['isinactive', s.Operator.IS, ['F']], 'and',
                ['salesrep', s.Operator.ANYOF, [salesrep]], 'and',
                ['custentity4', s.Operator.ANYOF, [property]]
            ]
        }).run().each(res => {
            
            let name = res.getValue({name: 'companyname'});
            checkAddIndex(res.id, name);
            return true;
        });
    }

    function fillAdvertiserIndex(filter) {

        log.audit({title: 'Finding Revenue Forecast Records...'});

        const { salesrep, property, startdate } = filter;
        const nsDate = format.format({value: startdate, type: format.Type.DATE});
        const advSearchFilter = FCUtil.revSearchFilter(nsDate, salesrep, property);
        const columns = [
            'custrecord_revenue_forecast_advertiser',
            'custrecord_revenue_forecast_type',
            'custrecord_revenue_forecast_sold',
            'custrecord_revenue_forecast_forecasted',
            'custrecord_revenue_forecast_probability',
            s.createColumn({
                name: 'formulacurrency',
                formula: '{custrecord_revenue_forecast_sold}+({custrecord_revenue_forecast_forecasted}*{custrecord_revenue_forecast_probability})'
            })
        ];


        s.create({
            type: 'customrecord_revenue_forecast',
            filters: advSearchFilter,
            columns: columns
        }).run().each(res => {
            // type === productGroup
            let sold = res.getValue({name: 'custrecord_revenue_forecast_sold'});
            let forecasted = res.getValue({name: 'custrecord_revenue_forecast_forecasted'});
            let probability = res.getValue({name: 'custrecord_revenue_forecast_probability'});
            let projected = res.getValue({name: 'formulacurrency'});
            let type = res.getValue({name: 'custrecord_revenue_forecast_type'});
            incrementCalcs(sold, forecasted, projected, type);
            // TODO check index for undefined
            let advertiser = res.getValue({name: 'custrecord_revenue_forecast_advertiser'});
            let advertiserName = res.getText({name: 'custrecord_revenue_forecast_advertiser'});

            checkAddIndex(advertiser, advertiserName);
            advertiserIndex[advertiser][type].recId = res.id;
            advertiserIndex[advertiser][type].sold = sold;
            advertiserIndex[advertiser][type].forecasted = forecasted;
            advertiserIndex[advertiser][type].probability = probability;
            advertiserIndex[advertiser][type].projected = projected;
            return true;
        });
    }

    function checkAddIndex(advertiser, name) {
        if (advertiserIndex[advertiser] === undefined) {
            advertiserIndex[advertiser] = {};
            advertiserIndex[advertiser].name = name;
            productGroups.forEach(grp => {
                advertiserIndex[advertiser][grp.id] = {};
                advertiserIndex[advertiser][grp.id].recId = null;
                advertiserIndex[advertiser][grp.id].sold = 0;
                advertiserIndex[advertiser][grp.id].forecasted = 0;
                advertiserIndex[advertiser][grp.id].probability = 0;
                advertiserIndex[advertiser][grp.id].projected = 0;
            });
        }
    }

    function incrementCalcs(sold, forecasted, projected, type) {
        calcs[type].sold += parseFloat(sold);
        calcs[type].forecasted += parseFloat(forecasted);
        calcs[type].projected += parseFloat(projected);
    };

    function getFilter(request) {
        const { salesrep, property, startdate, enddate, updatelogid } = request.parameters;

        const startValue = FCUtil.defaultStart(startdate, 0);
        const endValue = FCUtil.defaultEnd(enddate, 0);

        if (updatelogid) {
            try {
                const updateLog = record.load({ type: 'customrecord_fcupdate_log', id: updatelogid});
                const editLog = updateLog.getValue({ fieldId: 'custrecord_fcupdate_editlog'});
                const editfields = updateLog.getValue({ fieldId: 'custrecord_fcupdate_editfields'});

                log.audit({title: 'Starting forecastTotals update task'});
                const updateTask = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    params: {custscript_fcupdate_editlog: editLog},
                    scriptId: 'customscript_fcupdate'
                });
                const taskId = updateTask.submit();
                log.audit({
                    title: 'update task ID',
                    details: taskId
                });

                editedFields = JSON.parse(editfields);
                log.debug({ title: 'editedFields', details: JSON.stringify(editedFields)});
                record.delete({ type: 'customrecord_fcupdate_log', id: updatelogid});
                log.audit({
                    title: 'Forecast Update Log deleted',
                    details: updatelogid
                });
            } catch(err) {
                // editlog record deletion should be caught, work has already been done
                // task failures do not need to interrupt workflow
                log.error({
                    title: err.name,
                    details: err.message
                });
            }
        }

        return {
            salesrep: salesrep,
            property: property,
            startdate: startValue,
            enddate: endValue
        }
    }

    function renderList(form, productGroup) {

        let advertiserResults = [];
        Object.keys(advertiserIndex).forEach(adv => {
            let displayEntry = JSON.parse(JSON.stringify(advertiserIndex[adv][productGroup.id]));
            displayEntry.advertiser = adv;
            displayEntry.advertiserName = advertiserIndex[adv].name;
            advertiserResults.push(displayEntry);
        });

        // log.debug({title: 'advertiserResults', details: JSON.stringify(advertiserResults)});

        /* advertiserResults format
        {
            '1': [ // product group id
                {
                    'id': 1, // id of revenue forecast record or null
                    'advertiser': 1, //clientId
                    'advertiserName': 'companyname'
                    'sold': 1000,
                    'forecasted': 1000,
                    'probability': 0.5,
                    'projected': 1500
                } //,...
            ]
        }
        */

        const formatTotal = format.format({value: calcs[productGroup.id].sold || 0, type: format.Type.CURRENCY}).slice(0,-3);
        const formatProjected = format.format({value: calcs[productGroup.id].projected || 0, type: format.Type.CURRENCY}).slice(0,-3);
        const list = form.addSublist({
            id : 'custpage_product_group_' + productGroup.id,
            type : ui.SublistType.LIST,
            label : productGroup.name + ' [$' + formatTotal + ']'//' of $' + formatProjected + ']'
        });
        // TODO find better way to display these totals and projections


        const columns = forecastFields;
        columns.forEach(id => {
            const field = list.addField(id);
            // extras for input fields
            
            if (id.id === 'custrecord_revenue_forecast_forecasted' 
                || id.id === 'custrecord_revenue_forecast_probability'
                || id.id === 'custrecord_revenue_forecast_projected') {
                field.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY});
            }
            if (id.id === 'custrecord_revenue_forecast_projected') {
                field.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
            }
            if (id.id == 'scriptid') {
                field.updateDisplayType({displayType : ui.FieldDisplayType.HIDDEN});
            }
        });

        advertiserResults.forEach((res, index) => {
            // log.debug({title: 'checking result into display : ' + index, details: JSON.stringify(res)});
            Object.keys(res).forEach(key => {
                let value = res[key];
                // if field was edited update with the new value rather than one found in search
                let fieldIndex = editedFields.findIndex(function(field) {
                    return (field.sublistId === 'custpage_product_group_' + productGroup.id
                        && field.fieldId === 'custrecord_revenue_forecast_' + key
                        && field.line === index
                    );
                });
                if (fieldIndex !== -1) value = editedFields[fieldIndex].value;

                if (key === 'recId') {
                    list.setSublistValue({
                        id: 'scriptid',
                        line: index,
                        value: value || 0
                    });
                    return;
                }

                if ((value || value == 0) && key !== 'advertiserName' && key !== 'recId') {
                    if (key === 'advertiser'){
                        const link = url.resolveRecord({
                            isEditMode: false,
                            recordId: value,
                            recordType: 'customer',
                        });
                        value = '<a href="'+link+'" target="_blank">'+res.advertiserName+'</a>';
                    }
                    list.setSublistValue({
                        id: 'custrecord_revenue_forecast_' + key,
                        line: index,
                        value: value || 0
                    });
                }
            });
        });

        return list;
    }

    exports.onRequest = onRequest;
    return exports;
});