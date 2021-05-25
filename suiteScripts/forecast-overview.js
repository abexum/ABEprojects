define([
    "N/task",
    "N/format",
    "N/ui/serverWidget",
    "N/record",
    "N/log",
    "./FCUtil"
], function (task, format, ui, record, log, FCUtil) {

    /**
     * Sales Forecast Suitelet: Improved sales rep forecaster for ACBM
     *
     * @exports forecast-overview
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
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

    const displayValues = (selected) => [
        {
            value: 'worstcase',
            text: 'Worst Case',
            isSelected: (selected === 'worstcase')
        },
        {
            value: 'mostlikely',
            text: 'Most Likely',
            isSelected: (selected === 'mostlikely')
        },
        {
            value: 'upside',
            text: 'Upside',
            isSelected: (selected === 'upside')
        },
        {
            value: 'weighted',
            text: 'Weighted',
            isSelected: (selected === 'weighted')
        },
        {
            value: 'gross',
            text: 'Gross',
            isSelected: (selected === 'gross')
        },
        {
            value: 'universal',
            text: 'Universe',
            isSelected: (selected === 'universal')
        },
        {
            value: 'opportunity',
            text: 'Opportunities',
            isSelected: (selected === 'opportunity')
        },
        {
            value: 'estimate',
            text: 'Proposals',
            isSelected: (selected === 'estimate')
        },
        {
            value: 'salesorder',
            text: 'Orders',
            isSelected: (selected === 'salesorder')
        },
        {
            value: 'quota',
            text: 'Quota',
            isSelected: (selected === 'quota')
        },
        {
            value: 'booked',
            text: 'Booked %',
            isSelected: (selected === 'booked')
        }
        // make this inline html and heatmap
        // 0-50 red
        // 51-95 yellow
        // 96+ green

        // all whole numbers in the grid, no decimals
    ];

    const results = [];
    const abreviatedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totalsCol = {};

    const groupType = {
        class: {
            label: 'Property',
            values: []
        },
        salesrep: {
            label: 'Sales Rep',
            values: []
        }
    };

    const repNameIndex = {};
    const propertyNameIndex = {};

    function onRequest(context) {
        log.audit({title: 'Loading Forecast Suitelet...'});

        const filter = getFilter(context.request);
        if (FCUtil.adminView()) {
            log.audit({title: 'Starting forecastTotals update task'});
            const backfill = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                deploymentId: 'customdeploy_forecast_backfill',
                params: {custscript_backfill_startdate: filter.startdate},
                scriptId: 'customscript_forecast_backfill'
            });
            try {
                const taskId = backfill.submit();
                log.audit({
                    title: 'backfill task ID',
                    details: taskId
                });
            } catch(err) {
                // inqueue and in progress errors can be common
                log.error({
                    title: err.name,
                    details: err.message
                });
            }
        }

        const page = ui.createForm({
            title: 'Forecast Overview'
        });

        page.clientScriptModulePath = "./forecast-overview-cl.js";
        page.addButton({
            id : 'custpage_refreshButton',
            label : 'Refresh',
            functionName: 'refreshView'
        });

        filterOptionsSection(page, filter);
        renderList(page, 'class', filter);
        renderList(page,'salesrep', filter);


        context.response.writePage({
            pageObject: page
        });
    }

    const dateFields = (filter) => {
        const fieldObjs = [];
        const calcsCSV = FCUtil.grabFile('forecastTotals.csv');
        FCUtil.dateIndex(filter).forEach(dateObj => {
            let { month, year } = dateObj;
            fieldObjs.push({ 
                id: month + '_' + year,
                label: abreviatedMonths[month] + ' ' + year.toString().slice(-2),
                type: ui.FieldType.TEXT
            });
            if (calcsCSV) results.push(getResults(calcsCSV, month, year, filter));
        });
        fieldObjs.push({ 
            id: 'custpage_total',
            label: 'TOTAL',
            type: ui.FieldType.TEXT,
        });
        if (calcsCSV) results.push(totalsCol[filter.displayvalue]);

        return fieldObjs;
    };

    function filterOptionsSection(page, filter) {
        const filtergroup = page.addFieldGroup({
            id : 'custpage_filtergroup',
            label : 'Filter Results'
        });
        filtergroup.isBorderHidden = true;

        const salesRepSearchField = page.addField({
            id: 'custpage_salesrep',
            label: 'Filter Properties by Sales Rep',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        buildSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Filter Sales Reps by Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        buildProperties(propertySearchField, filter.property);
        propertySearchField.updateBreakType({ breakType : ui.FieldBreakType.STARTCOL });

        const displayValueField = page.addField({
            id: 'custpage_displayvalue',
            label: 'Display Value',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        })
        displayValues(filter.displayvalue).forEach(calc => {
            displayValueField.addSelectOption(calc);
        })
        displayValueField.updateBreakType({ breakType : ui.FieldBreakType.STARTCOL });

        const startDateField = page.addField({
            id: 'custpage_startdate',
            label: 'Start Date',
            type: ui.FieldType.DATE,
            container: 'custpage_filtergroup'
        });
        startDateField.updateBreakType({ breakType : ui.FieldBreakType.STARTCOL });
        startDateField.defaultValue = filter.startdate;
    }

    function getFilter(request) {
        const { salesrep, property, startdate, displayvalue } = request.parameters;

        const startValue = FCUtil.defaultStart(startdate);

        return {
            salesrep: salesrep,
            property: property,
            startdate: startValue,
            displayvalue: displayvalue || 'mostlikely'
        }
    }

    function renderList(form, type, filter) {

        const list = form.addSublist({
            id: 'custpage_' + type,
            type: ui.SublistType.LIST,
            label: groupType[type].label
        });
        list.addField({
            id: 'custpage_' + type + '_name',
            label: groupType[type].label,
            type: ui.FieldType.TEXT
        });

        groupType[type].values.forEach(value => {
            list.setSublistValue(value.sublistEntry);
        });

        const formatValue = (value, isTotal) => {
            if (filter.displayvalue !== 'booked') {
                const money = format.format({value: value, type: format.Type.CURRENCY}).slice(0,-3);
                return (isTotal) ? '<b style="font-size:110%;">'+money+'</b>' : money;
            }
            const percent = format.parse({value: value, type: format.Type.FLOAT}).toFixed();
            
            let color = ''
            if (percent < 51) {
                color = '#cc0000';
            } else if (percent < 96) {
                color = '#ffaa00' // '#ff8c1a'
            } else {
                color = '#2eb82e';
            }
            const size = (isTotal) ? '120' : '110';
            return '<b style="font-size:'+size+'%;color:'+color+';">'+percent+'</b>'
        };

        const setValues = params => {
            const { fieldId, index } = params;

            monthResults = results[index];
            groupType[type].values.forEach(value => {
                let display = monthResults[type]?.[value.id];
                let thisline = value.sublistEntry.line;

                // skip setting values where no total is recorded in results
                if (display === 0 || display) {
                    list.setSublistValue({
                        id: fieldId,
                        line: thisline,
                        value: formatValue(display, (fieldId === 'custpage_total' || value.id === 'total'))
                    });
                }
            });
            return;
        }

        dateFields(filter).forEach((month, index) => {
            list.addField(month);

            setValues({fieldId: month.id, index: index});
        });

        return list;
    }

    function buildSalesReps(field, selected) {
        FCUtil.getSalesReps(field, selected).forEach((res, index) => {
            let repName = res.getValue({name: 'entityid'});
            groupType.salesrep.values.push({
                id: res.id,
                sublistEntry: {
                    id: 'custpage_salesrep_name',
                    line: index,
                    value: repName
                }
            });
            repNameIndex[repName] = res.id;
        });
        const lastIndex = groupType.salesrep.values.length;
        groupType.salesrep.values.push({
            id: 'total',
            sublistEntry: {
                id: 'custpage_salesrep_name',
                line: lastIndex,
                value: 'TOTAL'
            }
        });
    }

    function buildProperties(field, selected) {
        FCUtil.getProperties(field, selected).forEach((res, index) => {
            let propertyName = res.getValue({name: 'name'});
            groupType.class.values.push({
                id: res.id,
                sublistEntry: {
                    id: 'custpage_class_name',
                    line: index,
                    value: propertyName
                }
            });
            propertyNameIndex[propertyName] = res.id;
        });
        const lastIndex = groupType.class.values.length;
        groupType.class.values.push({
            id: 'total',
            sublistEntry: {
                id: 'custpage_class_name',
                line: lastIndex,
                value: 'TOTAL'
            }
        });
    }

    function getResults(calcsCSV, month, year, filter) {
        const { displayvalue, property, salesrep } = filter;

        // grab Orders and Quota, total and divide them.
        if (displayvalue === 'booked') return getBookedResult(calcsCSV, month, year, filter);

        const lessInfo = (moreInfo) => {
            const {salesrep, property, date } = moreInfo;

            const lessismore = { 
                salesrep: salesrep,
                property: property,
                date: date
            };
            lessismore[displayvalue] = moreInfo[displayvalue];
            return lessismore;
        };
        const csvObjs = FCUtil.processCSV(calcsCSV).map(obj => lessInfo(obj));

        const filteredObjs = [];
        csvObjs.forEach(line => {
            if (line.date) {
                const date = new Date(line.date);
                const hasYear = (year == date.getFullYear());
                const hasMonth = (month == date.getMonth());
                if (hasMonth && hasYear) {
                    filteredObjs.push(line);
                }
            }
        });

        return {
            salesrep: getSalesrepResults(filteredObjs, displayvalue, property),
            class: getPropertyResults(filteredObjs, displayvalue, salesrep)
        };
    }

    function getBookedResult(calcsCSV, month, year, filter) {
        // collect numerator results
        filter.displayvalue = 'salesorder';
        const salesorderResults = getResults(calcsCSV, month, year, filter);

        // collect denominator results
        filter.displayvalue = 'quota';
        const quotaResults = getResults(calcsCSV, month, year, filter);

        filter.displayvalue = 'booked';

        const bookedSalesrepResults = {};
        Object.keys(quotaResults.salesrep).forEach(rep => {
            let q = quotaResults.salesrep[rep];
            if (q) {
                let so = salesorderResults.salesrep[rep] || 0;
                bookedSalesrepResults[rep] = ((so/q)*100).toFixed(2);
            }
        });

        const bookedPropertyResults = {};
        Object.keys(quotaResults.class).forEach(prop => {
            let q = quotaResults.class[prop];
            if (q) {
                let so = salesorderResults.class[prop] || 0;
                bookedPropertyResults[prop] = ((so/q)*100).toFixed(2);
            }
        });

        // calculate totals column for booked
        totalsCol.booked = {};
        totalsCol.booked.salesrep = {};
        totalsCol.booked.class = {};
        Object.keys(totalsCol.quota.salesrep).forEach(rep => {
            let q = totalsCol.quota.salesrep[rep];
            if (q) {
                let so = totalsCol.salesorder.salesrep[rep] || 0;
                totalsCol.booked.salesrep[rep] = ((so/q)*100).toFixed(2);
            }
        });

        Object.keys(totalsCol.quota.class).forEach(prop => {
            let q = totalsCol.quota.class[prop];
            if (q) {
                let so = totalsCol.salesorder.class[prop] || 0;
                totalsCol.booked.class[prop] = ((so/q)*100).toFixed(2);
            }
        });

        return {
            salesrep: bookedSalesrepResults,
            class: bookedPropertyResults
        };
    }

    function setTotalsCol(type, id, displayvalue, value) {
        if (!totalsCol[displayvalue]) totalsCol[displayvalue] = {};
        if (!totalsCol[displayvalue][type]) totalsCol[displayvalue][type] = {};
        if (!totalsCol[displayvalue][type][id]) totalsCol[displayvalue][type][id] = 0;
        totalsCol[displayvalue][type][id] += value;
        if (!totalsCol[displayvalue][type]['total']) totalsCol[displayvalue][type]['total'] = 0;
        totalsCol[displayvalue][type]['total'] += value;
    }

    function getSalesrepResults(csvObjs, displayvalue, property) {
        let propertyName = '';
        if (property && property !== '0') {
            propertyName = FCUtil.getPropertyName(property);
        }

        const entries = {};
        csvObjs.forEach(line => {
            if (!propertyName || propertyName === line.property){
                let repId = repNameIndex[line.salesrep];
                let monthTotal = parseInt(line[displayvalue]);
                if (monthTotal === 0 || monthTotal) {
                    if (!entries[repId]) entries[repId] = 0;
                    entries[repId] += monthTotal;
                    if (!entries['total']) entries['total'] = 0;
                    entries['total'] += monthTotal;
                    setTotalsCol('salesrep', repId, displayvalue, monthTotal);
                }
            }
        });
        return entries;
    }

    function getPropertyResults(csvObjs, displayvalue, salesrep) {
        let repName = '';
        if (salesrep && salesrep !== '0') {
            repName = FCUtil.getRepName(salesrep);
        }

        const entries = {};
        csvObjs.forEach(line => {
            if (!repName || repName === line.salesrep){
                let propertyId = propertyNameIndex[line.property];
                let monthTotal = parseInt(line[displayvalue]);
                if (monthTotal === 0 || monthTotal) {
                    if (!entries[propertyId]) entries[propertyId] = 0;
                    entries[propertyId] += monthTotal;
                    if (!entries['total']) entries['total'] = 0;
                    entries['total'] += monthTotal;
                    setTotalsCol('class', propertyId, displayvalue, monthTotal);
                }
            }
        });
        return entries;
    }

    exports.onRequest = onRequest;
    return exports;
});
