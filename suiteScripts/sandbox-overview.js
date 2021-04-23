define(["N/search", "N/task", "N/file", "N/format", "N/record", "N/ui/serverWidget", "N/runtime", "N/log"],
    function (s, task, file, format, record, ui, runtime, log) {

    /**
     * Sales Forecast Suitelet: Improved sales rep forecaster for ACBM
     *
     * @exports sandbox-overview
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/task
     * @requires N/file
     * @requires N/format
     * @requires N/record
     * @requires N/format
     * @requires N/ui/serverWidget
     * @requires N/runtime
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
     * @governance 0
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

    const adminMode = () => {
        const user = runtime.getCurrentUser();
        // roles...
        // administrator : 3
        // CFO : 41
        // A/P analyst : 1019
        // CEO : 1020
        // A/R analyst : 1022
        // financial analyst : 1026
        // CSV Integrator : 1037
        return (
            user.role === 3
            || user.role === 41
            || user.role === 1019
            || user.role === 1020
            || user.role === 1022
            || user.role === 1026
            || user.role === 1037
        );
    };

    const results = [];
    const abreviatedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dateIndex = (filter) => {
        const twelveMonths = [];
        for (let i = 0; i < 12; i++) {
            let colDate = new Date(filter.startdate.getFullYear(), filter.startdate.getMonth() + i, 1);
            monthIndex = colDate.getMonth();
            year = colDate.getFullYear();
            twelveMonths.push({
                month: monthIndex,
                year: year
            });
        }
        return twelveMonths;
    };

    const dateFields = (filter) => {
        const fieldObjs = [];
        const calcsCSV = grabFile('forecastTotals.csv');
        dateIndex(filter).forEach(dateObj => {
            let { month, year } = dateObj;
            fieldObjs.push({ 
                id: month + '_' + year,
                label: abreviatedMonths[month] + ' ' + year.toString().slice(-2),
                type: ui.FieldType.TEXT
            });
            if (calcsCSV) results.push(getResults(calcsCSV, month, year, filter));
        });
        return fieldObjs;
    };

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
        log.debug({title: 'request parameters', details: context.request.parameters});

        const filter = getFilter(context.request);
        if (adminMode()) {
            log.audit({title: 'Starting forecastTotals update task'});
            const backfill = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                deploymentId: 'customdeploy_sandbox_backfill_3',
                params: {custscript_start_date: filter.startdate},
                scriptId: 'customscript_sandbox_backfill_3'
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

        page.clientScriptModulePath = "./sandbox-overview-cl.js";
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
        getSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Filter Sales Reps by Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getProperties(propertySearchField, filter.property);
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

        const startValue = defaultStart(startdate);

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

        const lastRow = groupType[type].values.length;
        // add total row
        if (filter.displayvalue !== 'booked') {
            list.setSublistValue({
                id: 'custpage_' + type + '_name',
                line: lastRow,
                value: 'TOTAL'
            });
        }

        const formatValue = value => format.format({value: value, type: format.Type.CURRENCY}).slice(0,-3);

        const setValues = params => {
            const { fieldId, index } = params;
            let total = 0;

            monthResults = results[index];
            groupType[type].values.forEach(value => {
                let display = monthResults[type]?.[value.id];

                // skip setting values where no total is recorded in results
                if (display === 0 || display) {
                    list.setSublistValue({
                        id: fieldId,
                        line: value.sublistEntry.line,
                        value: formatValue(display)
                    });
                    total += display;
                }
            });
            return total;
        }

        dateFields(filter).forEach((month, index) => {
            list.addField(month);
            const monthTotal = setValues({fieldId: month.id, index: index});
            if (filter.displayvalue !== 'booked') {
                list.setSublistValue({
                    id: month.id,
                    line: lastRow,
                    value: formatValue(monthTotal)
                });
            }
        })

        return list;
    }

    function getSalesReps(field, selected) {
        field.addSelectOption({
            value: 0,
            text: '-- All --',
            isSelected: false
        });

        let index = 0;
        s.create({
            type: s.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
            filters: ['subsidiary', s.Operator.ANYOF, ['2']]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})){
                field.addSelectOption({
                    value: res.id,
                    text: res.getValue({name: 'entityid'}),
                    isSelected: (res.id === selected)
                });
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
                index++;
            }
            return true;
        });
    }

    function getProperties(field, selected) {
        field.addSelectOption({
            value: 0,
            text: '-- All --',
            isSelected: false
        });

        let index = 0;
        s.create({
            type: s.Type.CLASSIFICATION,
            columns: ['name'],
            filters: [
                ['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            field.addSelectOption({
                value: res.id,
                text: res.getValue({name: 'name'}),
                isSelected: (res.id === selected)
            });
            let propertyName = res.getValue({name: 'name'})
            groupType.class.values.push({
                id: res.id,
                sublistEntry: {
                    id: 'custpage_class_name',
                    line: index,
                    value: propertyName
                }
            });
            propertyNameIndex[propertyName] = res.id;
            index++;
            return true;
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
        const csvObjs = processCSV(calcsCSV).map(obj => lessInfo(obj));

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
        filter.displayvalue = 'salesorder';
        const salesorderResults = getResults(calcsCSV, month, year, filter);

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

        return {
            salesrep: bookedSalesrepResults,
            class: bookedPropertyResults
        };
    }

    function getSalesrepResults(csvObjs, displayvalue, property) {
        let propertyName = '';
        if (property && property !== '0') {
            propertyName = getPropertyName(property);
        }

        const entries = {};
        csvObjs.forEach(line => {
            if (!propertyName || propertyName === line.property){
                let repId = repNameIndex[line.salesrep];
                let monthTotal = parseInt(line[displayvalue]);
                if (monthTotal === 0 || monthTotal) {
                    if (!entries[repId]) entries[repId] = 0;
                    entries[repId] += monthTotal;
                }
            }
        });
        return entries;
    }

    function getPropertyResults(csvObjs, displayvalue, salesrep) {
        let repName = '';
        if (salesrep && salesrep !== '0') {
            repName = getRepName(salesrep);
        }

        const entries = {};
        csvObjs.forEach(line => {
            if (!repName || repName === line.salesrep){
                let propertyId = propertyNameIndex[line.property];
                let monthTotal = parseInt(line[displayvalue]);
                if (monthTotal === 0 || monthTotal) {
                    if (!entries[propertyId]) entries[propertyId] = 0;
                    entries[propertyId] += monthTotal;
                }
            }
        });
        return entries;
    }

    function defaultStart(start) {
        const date = (start) ? new Date(start.substring(0, start.indexOf('00:00:00'))) : new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    const getRepName = (id) => {
        if (!id || id === '0') return '';
        const employeeRecord = record.load({type: record.Type.EMPLOYEE, id: id});
        return employeeRecord.getValue({fieldId: 'entityid'});
    }

    const getPropertyName = (id) => {
        if (!id || id === '0') return '';
        const propertyRecord = record.load({type: record.Type.CLASSIFICATION, id: id});
        return propertyRecord.getValue({fieldId: 'name'});
    }

    function grabFile(filename) {
        var csvFile = '';

        try {
            csvFile = file.load({
                id: './'+filename
            });
        } catch(err) {
            if (err.name == 'RCRD_DSNT_EXIST'){
                log.audit({title: filename + 'not found, rebuilding'});
            } else {
                log.error({
                    title: err.toString(),
                    details: err.stack
                });
            }
        }
        return csvFile;
    }

    const csvSplit = (line) => {
        let splitLine = [];

        const quotesplit = line.split('"');
        const lastindex = quotesplit.length - 1;
        // split evens removing outside quotes, push odds
        quotesplit.forEach((val, index) => {
            if (index % 2 === 0) {
                const firstchar = (index == 0) ? 0 : 1;
                const trimmed = (index == lastindex) 
                    ? val.substring(firstchar)
                    : val.slice(firstchar, -1);
                trimmed.split(",").forEach(v => splitLine.push(v));
            } else {
                splitLine.push(val);
            }
        });
        return splitLine;
    }

    function processCSV(file){
        const iterator = file.lines.iterator();

        let keys = [];
        let key = '';
        let csvObjArray = [];

        // add header as object keys
        iterator.each(line =>{
            const header = line.value.toLowerCase().replace(/\s/g, '')
            keys = csvSplit(header);
            return false;
        });
        iterator.each(line => {
            const values = csvSplit(line.value);
            let lineobj = {};
            values.forEach((val, index) => {
                key = keys[index];
                if (key) lineobj[key] = val;
            });
            csvObjArray.push(lineobj);
            return true;
        });
        return csvObjArray;
    }

    exports.onRequest = onRequest;
    return exports;
});
