define([
    "N/search",
    "N/url",
    "N/task",
    "N/file",
    "N/format",
    "N/ui/serverWidget",
    "N/record",
    "N/log",
    "../sales-forecast/FCUtil"
], function (s, url, task, file, format, ui, record, log, FCUtil) {

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
        }
    ];

    var editedFields = [];
    
    const repFiltered = filter => (filter.salesrep && filter.salesrep !== '0');
    const propFiltered = filter => (filter.property && filter.property !== '0');

    const typesDictionary = {
        revForecast: {
            id: 'customrecord_revenue_forecast',
            label: 'Revenue Forecast',
            fields: forecastFields,
            searchFilter: 'customrecord_revenue_forecast'
        },
    };

    const productGroups = [];

    const calcs = {};

    const advertiserCalcs = {};

    const dataResults = {
        '1': [ // revenue type id
            {
                'id': 1, // or null
                'primaryAdvertiser': 1,
                'sold': 1000,
                'forecasted': 1000,
                'probability': 0.5,
                'projected': 1500
            } //,...
        ]
    }



    const fulfillmentUser = () => FCUtil.fulfillmentView();
    const salesRepUser = () => FCUtil.salesRepView();
    const adminUser = () => FCUtil.adminView();
    const adminTask = () => FCUtil.adminTask();

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

        const filter = getFilter(context.request);

        page.clientScriptModulePath = "./revenue-forecast-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Update Filters',
            functionName: 'performSearch'
        });
        page.addButton({
            id : 'custpage_saveButton',
            label : 'Save',
            functionName: 'save'
        });

        filterOptionsSection(page, filter);
        // run search without display limit to get calcs
        fullSearch(filter);

        fillProductGroups();

        // run searches that build sublists in display
        productGroups.forEach(group => {
            renderList(page, group, displaySearch(key, filter), filter);
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
        FCUtil.getSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        FCUtil.getProperties(propertySearchField, filter.property);

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
                log.debug({
                    title: 'search result col name in custom list', 
                    details: dupedRecord.sublists.customvalue[key].value
                });
                let pgID = dupedRecord.sublists.customvalue[key].valueid;
                let pgName = dupedRecord.sublists.customvalue[key].value;
                productGroups.push({
                    id: pgID,
                    name: pgName
                });
            }
        });
        log.debug({title: 'productGroups', details: productGroups});
    }

    function getFilter(request) {
        const { salesrep, property, startdate, enddate, updatelogid } = request.parameters;

        // tool is first opened, kickoff the quota update task in preparation for a search
        if (!(salesrep || property || startdate || enddate)) runTheQuotaUpdateTask = true;

        const startValue = FCUtil.defaultStart(startdate, fy);
        const endValue = FCUtil.defaultEnd(enddate, fy);

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

    function renderList(form, productGroup, results, filter) {

        const formatTotal = format.format({value: calcs[productGroup.id], type: format.Type.CURRENCY}).slice(0,-3);
        const list = form.addSublist({
            id : 'custpage_product_group_' + productGroup.id,
            type : ui.SublistType.LIST,
            label : productGroup.name + ' [$' + formatTotal +']'
        });

        const skip = id => {
            return (repFiltered(filter) && id === 'salesrep') 
            || (propFiltered(filter) && id === 'class');
        };

        const columns = typesDictionary[type].fields;
        columns.forEach(id => {
            // remove columns searched for
            if (skip(id.id)) return;
            const field = list.addField(id);
            // extras for input fields
            // entity status would go here as dropdown if needed
            if (id.id === 'probability' || (type === 'opportunity' && id.id === 'amount')) {
                field.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY});
            } else if (id.id === 'line') {
                field.updateDisplayType({displayType : ui.FieldDisplayType.HIDDEN});
            } else if ((adminUser() || fulfillmentUser())
                && (type === 'salesorder' && id.id === 'custcol_agency_mf_media_quantity_1')) {
                field.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY});
            }
        });
        if (type !== 'salesorder'){
            const weightField = list.addField({
                id: 'custpage_weighted',
                label: 'Weighted',
                type: ui.FieldType.CURRENCY,
            });
            weightField.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY});
            weightField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        }

        results.forEach((res, index) => {
            Object.keys(res).forEach(key => {
                if (skip(key)) return;
                let value = res[key];
                // if field was edited update with the new value rather than one found in search
                let fieldIndex = editedFields.findIndex(function(field) {
                    return (field.sublistId === 'custpage_' + type
                        && field.fieldId === key
                        && field.line === index
                    );
                });
                if (fieldIndex !== -1) value = editedFields[fieldIndex].value;
                if (value && key !== 'recordType' && key !== 'id') {
                    if (key === 'tranid'){
                        const link = url.resolveRecord({
                            isEditMode: false,
                            recordId: res.id,
                            recordType: res.recordType,
                        });
                        value = '<a href="'+link+'" target="_blank">'+value+'</a>';
                    }
                    list.setSublistValue({
                        id: key,
                        line: index,
                        value: value
                    });
                }
            });

            const grossnum = parseFloat(res.amount);
            if (type !== 'salesorder') {
                const weightvalue = grossnum*(parseFloat(res.probability)/100);
                list.setSublistValue({
                    id: 'custpage_weighted',
                    line: index,
                    value: weightvalue.toFixed(2)
                });
            }
        });

        return list;
    }



    function fullSearch(filter) {

        log.audit({title: 'Finding Revenue Forecast Records...'});

        const { rep, prop, startdate } = filter;
        const nsDate = format.format({value: startdate, type: format.Type.DATE});
        const filter = FCUtil.revSearchFilter(nsDate, rep, prop);
        const columns = forecastFields.map(f => f.id).concat('custrecord_revenue_forecast_type');

        s.create({
            type: 'customrecord_revenue_forecast',
            filters: filter,
            columns: columns
        }).run().each(res => {
            let type = res.getValue({name: 'custrecord_revenue_forecast_type'});
            incrementCalcs(res, type);
            // TODO begin building our indexed data values
            return true;
        });


        const incrementCalcs = (res, type) => {
            const sold = res.getValue({name: 'custrecord_revenue_forecast_sold'});
            calcs[type] += parseFloat(sold);
        };
    }

    function translate(result) {
        const fields = typesDictionary[result.recordType].fields;
        const row = {
            id: result.id,
            recordType: result.recordType
        };

        fields.forEach(f => {
            if (f.type === ui.FieldType.TEXT) {
                var text = (f.join)
                    ? result.getText({name: f.id, join: f.join})
                    : result.getText({name: f.id});
                // removeHierachy
                text = FCUtil.formatName(text)
                row[f.id] = (f.id === 'custbody_advertiser1')
                    ? text.substring(text.indexOf(' ')+1)
                    : text;
            } else {
                var value = (f.join)
                    ? result.getValue({name: f.id, join: f.join})
                    : result.getValue({name: f.id});
                if (f.id === 'custcolforecast_inclusion') {
                    row[f.id] = (value) ? 'T' : 'F';
                } else {
                    row[f.id] = value;
                }
            }
        });
        // increment the on the advertiser for the given month
        incrementAdvertiserRevenue(
            row['custbody_advertiser1'], 
            row['custcol_agency_mf_flight_end_date'],
            row['amount']
        );
        return row;
    }

    function incrementAdvertiserRevenue(advertiser, date, amount) {
        // TODO convert date to just month
        if (advertiserCalcs[advertiser] === undefined) advertiserCalcs[advertiser] = {};
        if (advertiserCalcs[advertiser][date] === undefined) {
            advertiserCalcs[advertiser][date] = amount;
            return;
        }
        advertiserCalcs[advertiser][date] += amount;
    }

    exports.onRequest = onRequest;
    return exports;
});