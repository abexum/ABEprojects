define(["N/search", "N/url", "N/task", "N/file", "N/format", "N/record", "N/ui/serverWidget", "N/runtime", "N/log"], 
    function (s, url, task, file, format, record, ui, runtime, log) {

    /**
     * Sales Forecast Suitelet: Improved sales rep forecaster for ACBM
     *
     * @exports sales-forecast
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

    const commonFields = type => [
        { 
            id: 'salesrep',
            label: 'Sales Rep',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'class',
            label: 'Property',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'custbody_advertiser1',
            label: 'Primary Advertiser',
            type: ui.FieldType.TEXT
        },
        { 
            id: 'tranid',
            label: type+' #',
            type: ui.FieldType.TEXTAREA
        },
        {
            id: 'line',
            label: 'line #',
            type: ui.FieldType.INTEGER
        },
        { 
            id: 'trandate',
            label: 'Transaction Date',
            type: ui.FieldType.DATE
        }
    ];
    const opportunityFields = [
        {
            id:'expectedclosedate',
            label: 'Expected Close',
            type: ui.FieldType.DATE
        },
        {
            id: 'custcol_agency_mf_flight_end_date',
            label: 'Flight End',
            type: ui.FieldType.DATE
        },
        {
            id: 'custcolforecast_inclusion',
            label: 'Forecast',
            type: ui.FieldType.CHECKBOX
        },
        { 
            id: 'probability',
            label: 'Probability',
            type: ui.FieldType.PERCENT
        },
        {
            id: 'amount',
            label: 'Gross',
            type: ui.FieldType.CURRENCY
        }
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

    const repFiltered = filter => (filter.salesrep && filter.salesrep !== '0');
    const propFiltered = filter => (filter.property && filter.property !== '0');

    const typesDictionary = {
        opportunity: {
            id: 'tranid',
            label: 'Opportunities',
            fields: commonFields('Opportunity').concat(opportunityFields),
            searchFilter: ['Opprtnty']
        },
        estimate: {
            id: 'tranid',
            label: 'Proposals',
            fields: commonFields('Proposal').concat(opportunityFields.slice(1)),
            searchFilter: ['Estimate']
        },
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields('Order').concat(orderFields),
            searchFilter: ['SalesOrd']
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

    const fulfillmentView = () => {
        const user = runtime.getCurrentUser();
        // roles...
        // controller : 1024
        // production and order entry : 1034
        return (user.role === 1024 || user.role === 1034);
    };

    const salesRepView = () => {
        const user = runtime.getCurrentUser();
        // roles...
        // CEO : 1022
        // sales representative : 1028
        // sales manager : 1027
        return ( user.role === 1022
            || user.role === 1027 
            || user.role === 1028);
    };

    const adminView = () => {
        const user = runtime.getCurrentUser();
        // roles...
        // administrator : 3
        // CFO : 41
        // A/P analyst : 1019
        // A/R analyst : 1020
        // financial analyst : 1026
        // CSV Integrator : 1037
        return (
            user.role === 3
            || user.role === 41
            || user.role === 1019
            || user.role === 1020
            || user.role === 1026
            || user.role === 1037
        );
    };

    // other roles ACBM, LLC ...
    // ACBM Concur : 1030
    // circulation : 1039
    // employee : 1025

    function onRequest(context) {
        log.audit({title: 'Loading Forecast Suitelet...'});
        log.debug({title: 'request parameters', details: context.request.parameters});

        let displayTitle = 'Sales Order Search';
        if (adminView()) displayTitle = 'Sales Forecast & Order Fulfillment';
        if (fulfillmentView()) displayTitle = 'Order Fulfillment';
        if (salesRepView()) displayTitle = 'Sales Forecast';

        const page = ui.createForm({
            title: displayTitle
        });

        const filter = getFilter(context.request);
        // keep quotas up to date when tool is first opened
        if (runTheQuotaUpdateTask) refreshQuotaResults();

        // handle new repPredictions from save event
        const repPredictions = getRepPredictions(context.request);

        page.clientScriptModulePath = "./sales-forecast-cl.js";
        page.addButton({
            id : 'custpage_searchButton',
            label : 'Perform Search',
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
        const quota = getQuotaCSVtotal(filter);
        if (repPredictions !== null) updateCSV(filter, repPredictions, quota);

        // run searches that build sublists in display
        Object.keys(typesDictionary).forEach(key => {
            if (fulfillmentView() && key !== 'salesorder') return;
            renderList(page, key, displaySearch(key, filter), filter);
        });

        const predictionValues = getPredictionCSVtotals(filter);

        if (salesRepView() || adminView()){
            calcSection(page, quota);
            predictionSection(page, filter, predictionValues);
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
        getSalesReps(salesRepSearchField, filter.salesrep);

        const propertySearchField = page.addField({
            id: 'custpage_property',
            label: 'Property',
            type: ui.FieldType.SELECT,
            container: 'custpage_filtergroup'
        });
        getProperties(propertySearchField, filter.property);

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

    function calcSection(page, quota) {
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
        const quotaField = page.addField({
            id: 'custpage_quota',
            label: 'Quota',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_calcsgroup'
        });
        quotaField.defaultValue = quota;
        quotaField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        const bookedField = page.addField({
            id: 'custpage_booked',
            label: 'Booked %',
            type: ui.FieldType.PERCENT,
            container: 'custpage_calcsgroup'
        });
        if (quota) bookedField.defaultValue = ((calcs.salesorder/quota)*100).toFixed(2);
        bookedField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
    }

    function predictionSection(page, filter, predictionValues) {
        page.addFieldGroup({
            id : 'custpage_predictiongroup',
            label : 'Sales Rep Predictions'
        });
        const worstField = page.addField({
            id: 'custpage_worstcase',
            label: 'Worst Case',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_predictiongroup'
        });
        if (predictionValues.worstcase) worstField.defaultValue = predictionValues.worstcase;
        
        const likelyField = page.addField({
            id: 'custpage_mostlikely',
            label: 'Most Likely',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_predictiongroup'
        });
        if (predictionValues.mostlikely) likelyField.defaultValue = predictionValues.mostlikely;

        const upsideField = page.addField({
            id: 'custpage_upside',
            label: 'Upside',
            type: ui.FieldType.CURRENCY,
            container: 'custpage_predictiongroup'
        });
        if (predictionValues.upside) upsideField.defaultValue = predictionValues.upside;

        const lastupdateField = page.addField({
            id: 'custpage_lastupdate',
            label: 'Last Update',
            type: ui.FieldType.DATETIMETZ,
            container: 'custpage_predictiongroup'
        });

        if (predictionValues.lastupdate) lastupdateField.defaultValue = predictionValues.lastupdate;
        lastupdateField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

        if (!(repFiltered(filter) && propFiltered(filter) && !filter.fullyear)) {
            worstField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
            likelyField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
            upsideField.updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});
        } else if (!predictionValues.worstcase) {
            worstField.defaultValue = calcs.salesorder.toFixed(2);
        }
    }

    function getFilter(request) {
        const { salesrep, property, startdate, enddate, fullyear } = request.parameters;

        // tool is first opened, kickoff the quota update task in preparation for a search
        if (!(salesrep || property || startdate || enddate || fullyear)) runTheQuotaUpdateTask = true;

        const fy = (fullyear === 'true');
        const startValue = defaultStart(startdate, fy);
        const endValue = defaultEnd(enddate, fy);

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
            } else if ((adminView() || fulfillmentView())
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
                let value = res[key]
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
        log.audit({title: 'Finding Transactions...'});
        let searchResults = [];
        s.create({
            type: s.Type.TRANSACTION,
            filters: searchFilter(filter, type),
            columns: typesDictionary[type].fields.map(op => op.id)
        }).run().each(res => {
            // update to grab only the page number
            searchResults.push(translate(res));
            if (searchResults.length === 300) return false;
            return true;
        });
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

        if (!filter.fullyear) {
            Object.keys(typesDictionary).forEach(type => {
                filters[type] = searchFilter(filter, type);
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
        } else {
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

    function getSalesReps(field, selected) {
        field.addSelectOption({
            value: 0,
            text: '-- All --',
            isSelected: false
        });

        s.create({
            type: s.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
            filters: [['subsidiary', s.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', s.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})){
                field.addSelectOption({
                    value: res.id,
                    text: res.getValue({name: 'entityid'}),
                    isSelected: (res.id === selected)
                });
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
            return true;
        });
    }

    function defaultStart(start, fullyear) {
        const date = (start) ? new Date(start.substring(0, start.indexOf('00:00:00'))) : new Date();
        return (fullyear)
            ? new Date(date.getFullYear(), 0, 1)
            : new Date(date.getFullYear(), date.getMonth(), 1);
    }
    function defaultEnd(end, fullyear) {
        const date = (end) ? new Date(end.substring(0, end.indexOf('00:00:00'))) : new Date();
        return (fullyear)  
            ? new Date(date.getFullYear(), 11, 31)
            : new Date(date.getFullYear(), date.getMonth() + 1, 0);
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
        const repFilterCSV = grabFile('forecastTotals.csv');
        if (!repFilterCSV) return {worstcase: '', mostlikely: '', upside: '', lastupdate: ''};

        const csvObjs = processCSV(repFilterCSV);
        const filteredLines = filterCSVlines(csvObjs, filter);

        const worstcase = filteredLines.reduce((total, current) => numOr0(total) + numOr0(current.worstcase), 0);
        const mostlikely = filteredLines.reduce((total, current) => numOr0(total) + numOr0(current.mostlikely), 0);
        const upside = filteredLines.reduce((total, current) => numOr0(total) + numOr0(current.upside), 0);
        const datesArray = filteredLines.map(entry => {
                return (entry.lastupdate) ? new Date(entry.lastupdate) : null;
            }).filter(date => date !== null);
        const lastupdate = new Date(Math.max(...datesArray));

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

    function updateCSV(filter, repPredictions, quota) {
        const { salesrep, property, startdate, fullyear } = filter;
        const { worstcase, mostlikely, upside } = repPredictions;

        const repName = getRepName(salesrep);
        const propertyName = getPropertyName(property);
        const month = startdate.getMonth();
        const year = startdate.getFullYear();
        const lastupdate = new Date();

        const { weighted, gross, universal, opportunity, estimate, salesorder } = calcs;

        const updatedPredictions = {
            salesrep: repName,
            property: propertyName,
            date: (month+1) + '/1/' + year,
            worstcase: worstcase,
            mostlikely: mostlikely,
            upside: upside,
            lastupdate: lastupdate,
            weighted: weighted,
            gross: gross,
            universal: universal,
            opportunity: opportunity,
            estimate: estimate,
            salesorder: salesorder,
            quota: quota
        }

        log.debug({
            title: 'updatedPredictions',
            details: JSON.stringify(updatedPredictions)
        })

        // predictions are salesrep, property and month specific for edits
        if (salesrep === '0' || property === '0' || fullyear) return;

        const predictionCSV = grabFile('forecastTotals.csv');

        var foundindex = -1;
        var csvObjs = [];

        if (predictionCSV) {
            log.audit({title: 'forecastTotals CSV successfully loaded'});
            csvObjs = processCSV(predictionCSV);
    
            // search for index of pre-existing data
            foundindex = csvObjs.findIndex(line => {
                if (line.date) {
                    const date = new Date(line.date);
                    const hasYear = (year == date.getFullYear());
                    const hasMonth = (month == date.getMonth());
                    if (hasMonth && hasYear) {
                        const hasRep = (repName == line.salesrep);
                        const hasProperty = (propertyName == line.property);
                        if (hasRep && hasProperty) return true;
                    }
                }
                return false;
            });
        }

        if (foundindex !== -1) {
            csvObjs.splice(foundindex, 1, updatedPredictions);
        } else {
            csvObjs.push(updatedPredictions);
        }

        const csvContent = csvString(csvObjs);

        var newCSV = file.create({
            name: 'forecastTotals.csv',
            fileType: file.Type.CSV,
            contents: csvContent
        });
        // file id is hard coded here (prod environment)
        newCSV.encoding = file.Encoding.UTF_8;
        newCSV.folder = 4579;
        
        const fileId = newCSV.save();
        log.audit({title: 'saving new CSV with file id: ' + fileId});
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

    function refreshQuotaResults() {
        log.audit({title: 'Refreshing Quota CSV...'});
        // SEARCH TO GET SAVED SEARCH INTERNAL ID FOR TASK
        let searchInternalId = '';
        s.create({
            type: s.Type.SAVED_SEARCH,
            filters: [],
            columns: ['id']
        }).run().each(res => {
            const resStr = JSON.stringify(res);
            const scriptid = JSON.parse(resStr).values.id;
            if (scriptid == 'customsearch_acbm_quota_search') {
                log.debug({title: 'quotaSearchScriptID', details: scriptid});
                log.debug({title: 'quotaSearchInternalID', details: res.id});
                searchInternalId = res.id;
                return false;
            }
            return true;
        });

        // SUBMIT TASK
        if (searchInternalId) {
            const quotaTask = task.create({taskType: task.TaskType.SEARCH});
            quotaTask.savedSearchId = searchInternalId;
            quotaTask.filePath = 'SuiteScripts/Suitelets/sales-forecast/quotaResults.csv';
            const quotaTaskId = quotaTask.submit();
            log.debug({title: 'quotaTaskId', details: quotaTaskId});
        } else {
            log.error({
                title: 'Quota Task Error',
                details: 'customsearch_acbm_quota_search not found, quotaResults.csv could not be built'
            })
        }
    }

    const numOr0 = n => isNaN(parseInt(n)) ? 0 : parseInt(n);

    exports.onRequest = onRequest;
    return exports;
});
