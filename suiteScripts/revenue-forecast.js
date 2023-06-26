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

    const commonFields = type => [
        { 
            id: 'custbody_advertiser1',
            label: 'Primary Advertiser',
            type: ui.FieldType.TEXT
        }
    ];

    const testFields = [
        { 
            id: 'amount',
            label: 'Sold',
            type: ui.FieldType.CURRENCY
        },
        {
            id: 'custcol_agency_mf_media_quantity_1',
            label: 'Forecasted',
            type: ui.FieldType.FLOAT
        },
        {
            id: 'custitem_product_group',
            join: 'item',
            label: 'Product Group',
            type: ui.FieldType.TEXT
        },
        // { 
        //     id: 'amount',
        //     label: 'July 23',
        //     type: ui.FieldType.CURRENCY
        // },
        // { 
        //     id: 'amount',
        //     label: 'Aug 23',
        //     type: ui.FieldType.CURRENCY
        // },
        // { 
        //     id: 'amount',
        //     label: 'Sep 23',
        //     type: ui.FieldType.CURRENCY
        // },
    ];
    const orderFields = [
        {
            id: 'custcol_agency_mf_flight_start_date',
            label: 'Flight Start',
            type: ui.FieldType.DATE
        },
        {
            id: 'custcol_agency_mf_flight_end_date',
            label: 'Flight End',
            type: ui.FieldType.DATE
        },
        {
            id: 'item',
            label: 'Item',
            type: ui.FieldType.TEXT
        },
        {
            id: 'custitem_product_group',
            join: 'item',
            label: 'Product Group',
            type: ui.FieldType.TEXT
        },
        {
            id: 'custcol_size',
            label: 'Size',
            type: ui.FieldType.TEXT
        },
        {
            id: 'custcol_agency_mf_rate_model',
            label: 'Rate Model',
            type: ui.FieldType.TEXT
        },
        {
            id: 'quantity',
            label: 'Quantity',
            type: ui.FieldType.FLOAT
        },
        {
            id: 'custcol_agency_mf_media_quantity_1',
            label: 'Media Quantity',
            type: ui.FieldType.FLOAT
        },
        { 
            id: 'amount',
            label: 'Full',
            type: ui.FieldType.CURRENCY
        }
    ];

    var runTheQuotaUpdateTask = false;
    var editedFields = [];
    

    const repFiltered = filter => (filter.salesrep && filter.salesrep !== '0');
    const propFiltered = filter => (filter.property && filter.property !== '0');

    const typesDictionary = {
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields('Order').concat(testFields),
            searchFilter: 'SalesOrd'
        },
    };

    const calcs = {
        weighted: 0, 
        gross: 0, 
        universal: 0, 
        opportunity: 0, 
        estimate: 0, 
        salesorder: 0
    };

    const advertiserCalcs = {};

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

        // run searches that build sublists in display
        Object.keys(typesDictionary).forEach(key => {
            if (fulfillmentUser() && key !== 'salesorder') return;
            renderList(page, key, displaySearch(key, filter), filter);
        });

        if (salesRepUser() || adminUser()){
            calcSection(page);
        }

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
        const fullyearField = page.addField({
            id: 'custpage_fullyear',
            label: 'search full year',
            type: ui.FieldType.CHECKBOX,
            container: 'custpage_filtergroup'
        });
        
        fullyearField.defaultValue = (filter.fullyear) ? 'T' : 'F';
    }

    function calcSection(page) {
        page.addFieldGroup({
            id : 'custpage_calcsgroup',
            label : 'Forecast Calcs'
        });
        const weightedField = page.addField({
            id: 'custpage_calcweight',
            label: 'Weighted',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        weightedField.defaultValue = calcs.weighted.toFixed(2);
        weightedField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const grossField = page.addField({
            id: 'custpage_calcgross',
            label: 'Gross',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        grossField.defaultValue = calcs.gross.toFixed(2);
        grossField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const universalField = page.addField({
            id: 'custpage_calcuniversal',
            label: 'Universe',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        universalField.defaultValue = calcs.universal.toFixed(2);
        universalField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        universalField.updateBreakType({
            breakType : ui.FieldBreakType.STARTCOL
        });
    }

    function getFilter(request) {
        const { salesrep, property, startdate, enddate, fullyear, updatelogid } = request.parameters;

        // tool is first opened, kickoff the quota update task in preparation for a search
        if (!(salesrep || property || startdate || enddate || fullyear)) runTheQuotaUpdateTask = true;

        const fy = (fullyear === 'true');
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
            enddate: endValue,
            fullyear: fy
        }
    }

    function getRepPredictions(request) {
        const { worstcase, mostlikely, upside } = request.parameters;
        return (worstcase || mostlikely || upside) 
            ? {worstcase: worstcase, mostlikely: mostlikely, upside: upside}
            : null;
    }

    function renderList(form, type, results, filter) {

        const formatTotal = format.format({value: calcs[type], type: format.Type.CURRENCY}).slice(0,-3);
        const list = form.addSublist({
            id : 'custpage_' + type,
            type : ui.SublistType.LIST,
            label : typesDictionary[type].label + ' [$' + formatTotal +']'
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

    function displaySearch(type, filter) {
        if (!repFiltered(filter) && !propFiltered(filter)) return [];
        log.audit({title: 'Finding Transactions...'});
        let searchResults = [];
        // TODO adjust month display behavior
        for (let month = 0; month < 12; month++) {
            s.create({
                type: s.Type.TRANSACTION,
                filters: buildSearchFilter(filter, type, month),
                columns: typesDictionary[type].fields.map(op => {
                    if (op.join) {
                        return s.createColumn({ name: op.id, join: op.join });
                    }
                    return op.id;
                })
            }).run().each(res => {
                // update to grab only the page number
                searchResults.push(translate(res));
                if (searchResults.length === 300) return false;
                return true;
            });
        }

        return searchResults;
    }

    function fullSearch(filter) {
        let filters = {};
        const columns = (type) => {
            const cols = ['amount'];
            if (type !== 'salesorder') {
                cols.push('probability');
                cols.push('custcolforecast_inclusion');
            }
            return cols;
        };

        const incrementCalcs = (res, type) => {
            const amount = res.getValue({name: 'amount'});
            const probability = res.getValue({name: 'probability'});
            const forecast = res.getValue({name: 'custcolforecast_inclusion'});

            const grossnum = parseFloat(amount);
            calcs.universal+= grossnum;
            calcs[type]+=grossnum;
            if (type !== 'salesorder') {
                const weightvalue = grossnum*(parseFloat(probability)/100);
                if (forecast) {
                    calcs.weighted+=weightvalue;
                    calcs.gross+=grossnum;
                }
            } else {
                calcs.weighted+=grossnum;
                calcs.gross+=grossnum;
            }
        };

        // TODO run for rolling period of 12 months
        // run each month calc individually to avoid return overflow
        for (let month = 0; month < 12; month++) {
            Object.keys(typesDictionary).forEach(type => {
                filters[type] = buildSearchFilter(filter, type, month);
            });
            Object.keys(typesDictionary).forEach(type => {
                s.create({
                    type: s.Type.TRANSACTION,
                    filters: filters[type],
                    columns: columns(type)
                }).run().each(res => {
                    incrementCalcs(res, type);
                    return true;
                });
            });
        }
    }

    function buildSearchFilter(filter, transactionType, month) {
        if (!month && month !== 0) month = filter.startdate.getMonth();
        const year = filter.startdate.getFullYear();
        const monthfilter = FCUtil.searchFilter(
            typesDictionary[transactionType].searchFilter,
            month,
            year
        );
        const { salesrep, property } = filter;
        if (repFiltered(filter)) {
            const repFilter = s.createFilter({
                name: 'salesrep',
                operator: s.Operator.ANYOF,
                values: salesrep
            });
            monthfilter.push(repFilter);
        }
        if (propFiltered(filter)) {
            const propertyFilter = s.createFilter({
                name: 'class',
                operator: s.Operator.ANYOF,
                values: property
            });
            monthfilter.push(propertyFilter);
        }
        return monthfilter;
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