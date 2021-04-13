define(["N/search", "N/url", "N/task", "N/file", "N/format", "N/record", "N/ui/serverWidget", "N/error", "N/log"], 
    function (s, url, task, file, format, record, ui, e, log) {

    /**
     * Sales Forecast Suitelet: Improved sales rep forecaster for ACBM
     *
     * @exports sandbox-overview
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/url
     * @requires N/task
     * @requires N/record
     * @requires N/format
     * @requires N/ui/serverWidget
     * @requires N/error
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
            isSelected: (selected === this.value)
        },
        { 
            value: 'mostlikely',
            text: 'Most Likely',
            isSelected: (selected === this.value)
        },
        { 
            value: 'upside',
            text: 'Upside',
            isSelected: (selected === this.value)
        },
        { 
            value: 'weighted',
            text: 'Weighted',
            isSelected: (selected === this.value)
        },
        { 
            value: 'gross',
            text: 'Gross',
            isSelected: (selected === this.value)
        },
        { 
            value: 'universal',
            text: 'Universe',
            isSelected: (selected === this.value)
        },
        { 
            value: 'opportunity',
            text: 'Opportunities',
            isSelected: (selected === this.value)
        },
        { 
            value: 'estimate',
            text: 'Proposals',
            isSelected: (selected === this.value)
        },
        {
            value: 'salesorder',
            text: 'Orders',
            isSelected: (selected === this.value)
        },
        { 
            value: 'quota',
            text: 'Quota',
            isSelected: (selected === this.value)
        },
        {
            value: 'booked',
            text: 'Booked %',
            isSelected: (selected === this.value)
        }
        // make this inline html and heatmap
        // 0-50 red
        // 51-95 yellow
        // 96+ green

        // all whole numbers in the grid, no decimals
    ];

    const abreviatedMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dateFields = (startdate) => {
        const fieldObjs = [];
        for (let i = 0; i < 12; i++) {
            let colDate = new Date(startdate.getFullYear(), startdate.getMonth() + i, 1);
            monthIndex = colDate.getMonth();
            year = colDate.getFullYear();
            fieldObjs.push({ 
                id: monthIndex + '_' + year,
                label: abreviatedMonths[monthIndex] + ' ' + year.slice(-2),
                type: ui.FieldType.TEXT
            });
        }
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

    const repFiltered = filter => (filter.salesrep && filter.salesrep !== '0');
    const propFiltered = filter => (filter.property && filter.property !== '0');

    const calcs = {
        weighted: 0, 
        gross: 0, 
        universal: 0, 
        opportunity: 0, 
        estimate: 0, 
        salesorder: 0
    };

    function onRequest(context) {
        log.audit({title: 'Loading Forecast Suitelet...'});
        log.debug({title: 'request parameters', details: context.request.parameters});

        const page = ui.createForm({
            title: 'Forecast Overview'
        });

        const filter = getFilter(context.request);

        // handle new repPredictions from save event
        const repPredictions = getRepPredictions(context.request);
        if (repPredictions !== null) updateCSV(filter, repPredictions);

        page.clientScriptModulePath = "./sandbox-overview-cl.js";
        page.addButton({
            id : 'custpage_refreshButton',
            label : 'Refresh',
            functionName: 'refreshView'
        });

        filterOptionsSection(page, filter);
        // run search without display limit to get calcs
        fullSearch(filter);

        // const quota = getQuotaCSVtotal(filter);
        // const predictionValues = getPredictionCSVtotals(filter);

        // build the property and sales rep sublists
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
            label: 'Sales Rep',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getProperties(propertySearchField, filter.property);

        const displayValueField = pageForm.addField({
            id: 'custpage_displayvalue',
            label: 'Display Value',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        })
        displayValues(filter.displayvalue).forEach(calc => {
            displayValueField.addSelectOption(calc);
        })

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

        // const formatTotal = format.format({value: calcs[type], type: format.Type.CURRENCY}).slice(0,-3);
        const list = form.addSublist({
            id: 'custpage_' + grouptType[type].id,
            type: ui.SublistType.LIST,
            label: groupType[type].label// + ' [$' + formatTotal +']'
        });
        list.addField({
            id: 'custpage_' + grouptType[type].id + '_name',
            label: groupType[type].label,
            type: ui.FieldType.TEXT
        });

        groupType[type].values.forEach(value => {
            list.setSublistValue(value.setSublistValue);
        });

        dateFields(filter.startdate).forEach( month => {
            list.addField(month);
        })

        // columns.forEach(id => {
        //     // remove columns searched for
        //     if (skip(id.id)) return;
        //     const field = list.addField(id);
        //     // extras for input fields
        //     // entity status would go here as dropdown if needed
        //     if (id.id === 'probability' || (type === 'opportunity' && id.id === 'amount')) {
        //         field.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY
        //         });
        //     }
        // });
        // if (type !== 'salesorder'){
        //     const weightField = list.addField({
        //         id: 'custpage_weighted',
        //         label: 'Weighted',
        //         type: ui.FieldType.CURRENCY,
        //     });
        //     weightField.updateDisplayType({displayType: ui.FieldDisplayType.ENTRY});
        //     weightField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        // }

        // results.forEach((res, index) => {
        //     Object.keys(res).forEach(key => {
        //         if (skip(key)) return;
        //         let value = res[key]
        //         if (value && key !== 'recordType' && key !== 'id') {
        //             if (key === 'tranid'){
        //                 const link = url.resolveRecord({
        //                     isEditMode: false,
        //                     recordId: res.id,
        //                     recordType: res.recordType,
        //                 });
        //                 value = '<a href="'+link+'" target="_blank">'+value+'</a>'
        //             } else if (type !== 'salesorder' && key === 'class') {
        //             }
        //             list.setSublistValue({
        //                 id: key,
        //                 line: index,
        //                 value: value
        //             });
        //         }
        //     });

        //     const grossnum = parseFloat(res.amount);
        //     if (type !== 'salesorder') {
        //         const weightvalue = grossnum*(parseFloat(res.probability)/100);
        //         list.setSublistValue({
        //             id: 'custpage_weighted',
        //             line: index,
        //             value: weightvalue.toFixed(2)
        //         });
        //     }
        // });

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
                groupType.salesrep.values.push({
                    id: res.id,
                    sublistEntry: {
                        id: 'custpage_salesrep_name',
                        line: index,
                        value: res.getValue({name: 'name'})
                    }
                });
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
            groupType.class.values.push({
                id: res.id,
                sublistEntry: {
                    id: 'custpage_class_name',
                    line: index,
                    value: res.getValue({name: 'name'})
                }
            });
            index++;
            return true;
        });
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

        // run each month calc individually to avoid return overflow
        for (month = 0; month < 12; month++) {
            Object.keys(typesDictionary).forEach(type => {
                filters[type] = searchFilter(filter, type, month);
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

    function searchFilter(filter, transactionType, month) {
        let searchFilter = [];

        const subsFilter = s.createFilter({
            name: 'subsidiary',
            operator: s.Operator.ANYOF,
            values: '2'
        });
        searchFilter.push(subsFilter);
        if (transactionType) {
            const typeFilter = s.createFilter({
                name: 'type',
                operator: s.Operator.ANYOF,
                values: typesDictionary[transactionType].searchFilter
            });
            searchFilter.push(typeFilter);
        }

        if (transactionType === 'opportunity') {
            const discussionFilter = s.createFilter({
                name: 'entitystatus',
                operator: s.Operator.ANYOF,
                values: '8',
            });
            searchFilter.push(discussionFilter);
        }

        if (transactionType === 'estimate') {
            const statusFilter = s.createFilter({
                name: 'formulatext',
                operator: s.Operator.IS,
                values: 'open',
                formula: '{status}'
            });
            searchFilter.push(statusFilter);
        }

        const { salesrep, property } = filter;
        if (repFiltered(filter)) {
            const repFilter = s.createFilter({
                name: 'salesrep',
                operator: s.Operator.ANYOF,
                values: salesrep
            });
            searchFilter.push(repFilter);
        }
        if (propFiltered(filter)) {
            const propertyFilter = s.createFilter({
                name: 'class',
                operator: s.Operator.ANYOF,
                values: property
            });
            searchFilter.push(propertyFilter);
        }

        const startdate = (month || month === 0)
            ? new Date(filter.startdate.getFullYear(), month, 1)
            : filter.startdate;
        const enddate = (month || month === 0)
            ? new Date(filter.startdate.getFullYear(), month + 1, 0)
            : filter.enddate;

        const startval = format.format({value: startdate, type: format.Type.DATE});
        const endval = format.format({value: enddate, type: format.Type.DATE});
        const startFilter = s.createFilter({
            name: 'custcol_agency_mf_flight_end_date',
            operator: s.Operator.ONORAFTER,
            values: startval
        });
        const endFilter = s.createFilter({
            name: 'custcol_agency_mf_flight_end_date',
            operator: s.Operator.ONORBEFORE,
            values: endval
        });
        searchFilter.push(startFilter, endFilter);

        return searchFilter;
    }

    function defaultStart(start) {
        const date = (start) ? new Date(start.substring(0, start.indexOf('00:00:00'))) : new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function translate(result) {
        const fields = typesDictionary[result.recordType].fields;
        const row = {
            id: result.id,
            recordType: result.recordType
        };
        fields.forEach(f => {
            if (f.type === ui.FieldType.TEXT) {
                var text = result.getText({name: f.id})
                row[f.id] = (f.id === 'custbody_advertiser1')
                    ? text.substring(text.indexOf(' ')+1)
                    : text;
            } else {
                var value = result.getValue({name: f.id});
                if (f.id === 'custcolforecast_inclusion') {
                    row[f.id] = (value) ? 'T' : 'F';
                } else {
                    row[f.id] = value;
                }
            }
        })
        return row;
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

    function getQuotaCSVtotal(filter) {
        const quotaCSV = grabFile('quotaResults.csv');
        if (!quotaCSV) {
            refreshQuotaResults();
            return 0;
        }

        const lessInfo = (moreInfo) => {
            const {salesrep, property, date, amountmonthly } = moreInfo;
            const lessismore = { 
                salesrep: salesrep,
                property: property,
                date: date,
                amountmonthly: amountmonthly
            };
            return lessismore;
        };
        const csvObjs = processCSV(quotaCSV).map(obj => lessInfo(obj));

        const quotas = filterCSVlines(csvObjs, filter);

        // sum the remaining monthly amounts     
        const quotaTotal = quotas.reduce((total, current) => numOr0(total) + numOr0(current.amountmonthly), 0);

        return quotaTotal;
    }

    function getPredictionCSVtotals(filter) {
        const repFilterCSV = grabFile('repPredictions.csv');
        if (!repFilterCSV) return {worstcase: '', mostlikely: '', upside: '', lastupdate: ''};

        const csvObjs = processCSV(repFilterCSV);
        const filteredLines = filterCSVlines(csvObjs, filter);

        const worstcase = filteredLines.reduce((total, current) => numOr0(total) + numOr0(current.worstcase), 0);
        const mostlikely = filteredLines.reduce((total, current) => numOr0(total) + numOr0(current.mostlikely), 0);
        const upside = filteredLines.reduce((total, current) => numOr0(total) + numOr0(current.upside), 0);
        const lastupdate = new Date(Math.max(...filteredLines.map(entry => new Date(entry.lastupdate))));
        return {
            worstcase: worstcase,
            mostlikely: mostlikely,
            upside: upside,
            lastupdate: lastupdate
        }
    }

    function filterCSVlines(csvObjs, filter) {
        let filtered = [];
        const { salesrep, property } = filter;
        const repName = getRepName(salesrep);
        const propertyName = getPropertyName(property);
        const month = filter.startdate.getMonth();
        const year = filter.startdate.getFullYear();

        csvObjs.forEach(line => {
            if (line.date) {
                const date = new Date(line.date);
                const hasYear = (year == date.getFullYear());
                const hasMonth = filter.fullyear || (month == date.getMonth());
                if (hasMonth && hasYear) {
                    const hasRep = !(repName && repName !== line.salesrep);
                    const hasProperty = !(propertyName && propertyName !== line.property);
                    if (hasRep && hasProperty) filtered.push(line);
                }
            }
        });
        return filtered;
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

    function csvString(cvsObjs) {
        var csvArray = [];
        var keys = [];
        Object.keys(cvsObjs[0]).forEach(key => {
            keys.push(key);
        });
        csvArray.push(keys.join(','));
        cvsObjs.forEach(obj => {
            var values = [];
            Object.keys(obj).forEach(key => {
                var value = (obj[key].toString().includes(','))
                    ? ('\"' + obj[key] + '\"')
                    : obj[key];
                values.push(value);
            });
            csvArray.push(values.join(','));
        });
        return csvArray.join('\n');
    }

    const numOr0 = n => isNaN(parseInt(n)) ? 0 : parseInt(n);

    exports.onRequest = onRequest;
    return exports;
});
