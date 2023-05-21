define(["N/search", "N/file", "N/format", "N/runtime", "N/record", "N/log"],
    function (search, file, format, runtime, record, log) {

    /**
     * @requires N/search
     * @requires N/file
     * @requires N/format
     * @requires N/runtime
     * @requires N/record
     * @requires N/log
     *
     * @NModuleScope Public
     * @NApiVersion 2.1
     */

    const FCUtil = {};

    FCUtil.adminView = () => {
        const user = runtime.getCurrentUser();
        // Administrator : 3
        // CFO : 41
        // ACBM, LLC - A/P analyst : 1019
        // ACBM, LLC - A/R analyst : 1020
        // ACBM, LLC - CFO : 1023
        // ACBM, LLC - Controller : 1024
        // ACBM, LLC - Financial Analyst : 1026
        return (
            user.role === 3
            || user.role === 41
            || user.role === 1019
            || user.role === 1020
            || user.role === 1023
            || user.role === 1024
            || user.role === 1026
        );
    };

    FCUtil.adminTask = () => {
        const user = runtime.getCurrentUser();
        // Administrator : 3
        return (
            user.role === 3
        );
    };

    FCUtil.salesRepView = () => {
        const user = runtime.getCurrentUser();
        // ACBM, LLC - CEO : 1022
        // ACBM, LLC - Sales Manager : 1027
        // ACBM, LLC - Sales Representative : 1028
        return ( 
            user.role === 1022
            || user.role === 1027 
            || user.role === 1028
        );
    };

    FCUtil.fulfillmentView = () => {
        const user = runtime.getCurrentUser();
        // ACBM, LLC - Production & Order Entry : 1034
        return (
            user.role === 1034
        );
    };

    /* ALL ROLES w/ Employee assigned
     *  Administrator : 3
     *  Employee Center : 15 *
     *  CFO : 41
     *  NetSuite Implementation Team : 1017 *
     *  ACBM, LLC - A/P analyst : 1019
     *  ACBM, LLC - A/R analyst : 1020
     *  ACBM, LLC - CEO : 1022
     *  ACBM, LLC - CFO : 1023
     *  ACBM, LLC - Controller : 1024
     *  ACBM, LLC - Employee : 1025 * 
     *  ACBM, LLC - Financial Analyst : 1026
     *  ACBM, LLC - Sales Manager : 1027
     *  ACBM, LLC - Sales Representative : 1028
     *  ACBM Concur : 1030 *
     *  Dunning Director : 1032 *
     *  ACBM, LLC - Production & Order Entry : 1034
     *  Solupay Integration : 1035 *
     *  CSV Integrator : 1037 *
     *  ACBM, LLC - Circulation : 1039 *
     * 
     * * user roles that have read only view *
     * there are about 44 roles in the system without any assigned employees as well
     * TODO rebuild these functions depend on editable records in netsuite
    */

    FCUtil.dateIndex = (filter) => {
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

    FCUtil.defaultStart = (start, fullyear) => {
        const date = (start) ? new Date(start.substring(0, start.indexOf('00:00:00'))) : new Date();
        return (fullyear)
            ? new Date(date.getFullYear(), 0, 1)
            : new Date(date.getFullYear(), date.getMonth(), 1);
    }

    FCUtil.defaultEnd = (end, fullyear) => {
        const date = (end) ? new Date(end.substring(0, end.indexOf('00:00:00'))) : new Date();
        return (fullyear)  
            ? new Date(date.getFullYear(), 11, 31)
            : new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    FCUtil.getRepName = (id) => {
        if (!id || id === '0') return '';
        const employeeRecord = record.load({type: record.Type.EMPLOYEE, id: id});
        return employeeRecord.getValue({fieldId: 'entityid'});
    }

    FCUtil.getPropertyName = (id) => {
        if (!id || id === '0') return '';
        const propertyRecord = record.load({type: record.Type.CLASSIFICATION, id: id});
        let name = propertyRecord.getValue({fieldId: 'namenohierarchy'});
        if (!name) name = propertyRecord.getValue({fieldId: 'name'}).split(' : ').pop();
        return name
    }

    // TODO these functions do not work, do not use
    FCUtil.getSalesrepId = (name) => {
        let id = 0;
        return id;
        search.create({
            type: search.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
            filters: [['subsidiary', search.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', search.Operator.IS, ['F']], 'and',
                ['entityid', search.Operator.ANYOF, [name]]
            ]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})){
                let resultName = res.getValue({name: 'entityid'})
                
                if (formattedName === resultName.split(' : ').pop()) {
                    id = res.id;
                    return false;
                }
            }
            return true;
        });
        return id;
    }
    // TODO these functions do not work, do not use
    FCUtil.getPropertyId = (name) => {
        let id = 0;
        return id;
        search.create({
            type: search.Type.CLASSIFICATION,
            columns: ['namenohierarchy'],
            filters: [
                ['subsidiary', search.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', search.Operator.IS, ['F']], 'and',
                ['custrecord_parent_property_indicator', search.Operator.IS, ['F']], 'and',
                ['namenohierarchy', search.Operator.ANYOF, [name]]
            ]
        }).run().each(res => {
            if (name === res.getValue({name: 'namenohierarchy'})) {
                id = res.id;
                return false;
            }
            return true;
        });
        return id;
    }

    FCUtil.formatName = (name) => {
        if (name) return name.split(' : ').pop();
        return ''
    }

    FCUtil.getSalesReps = (field, selected) => {
        field.addSelectOption({
            value: 0,
            text: '-- All --',
            isSelected: false
        });

        const results = [];
        search.create({
            type: search.Type.EMPLOYEE,
            columns: ['entityid', 'issalesrep'],
            filters: [['subsidiary', search.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', search.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            if (res.getValue({name: 'issalesrep'})){
                field.addSelectOption({
                    value: res.id,
                    text: res.getValue({name: 'entityid'}),
                    isSelected: (res.id === selected)
                });
                results.push(res);
            }
            return true;
        });
        return results;
    }

    FCUtil.getProperties = (field, selected) => {
        field.addSelectOption({
            value: 0,
            text: '-- All --',
            isSelected: false
        });

        const results = [];
        search.create({
            type: search.Type.CLASSIFICATION,
            columns: ['namenohierarchy', 'name'],
            filters: [
                ['subsidiary', search.Operator.ANYOF, ['2']], 'and', 
                ['isinactive', search.Operator.IS, ['F']], 'and',
                ['custrecord_parent_property_indicator', search.Operator.IS, ['F']]
            ]
        }).run().each(res => {
            
            let nameText = res.getValue({name: 'namenohierarchy'});
            if (!nameText) nameText = res.getValue({name: 'name'}).split(' : ').pop()

            field.addSelectOption({
                value: res.id,
                text: nameText,
                isSelected: (res.id === selected)
            });
            results.push(res);
            return true;
        });
        return results;
    }

    FCUtil.searchFilter = (transactionSearchType, month, year) => {
        const searchFilter = [];

        const subsFilter = search.createFilter({
            name: 'subsidiary',
            operator: search.Operator.ANYOF,
            values: '2'
        });
        searchFilter.push(subsFilter);
        if (transactionSearchType) {
            const typeFilter = search.createFilter({
                name: 'type',
                operator: search.Operator.ANYOF,
                values: transactionSearchType
            });
            searchFilter.push(typeFilter);
        }

        if (transactionSearchType === 'Opprtnty') {
            const discussionFilter = search.createFilter({
                name: 'entitystatus',
                operator: search.Operator.ANYOF,
                values: '8',
            });
            searchFilter.push(discussionFilter);
        }

        if (transactionSearchType === 'Estimate') {
            const statusFilter = search.createFilter({
                name: 'formulatext',
                operator: search.Operator.IS,
                values: 'open',
                formula: '{status}'
            });
            searchFilter.push(statusFilter);
        }
        
        if (transactionSearchType === 'SalesOrd') {
            const cancelledFilter = search.createFilter({
                name: 'custcolcancelled_line',
                operator: search.Operator.IS,
                values: 'F',
            });
            searchFilter.push(cancelledFilter);
        }

        const startdate = new Date(year, month, 1);
        const enddate = new Date(year, month + 1, 0);

        const startval = format.format({value: startdate, type: format.Type.DATE});
        const endval = format.format({value: enddate, type: format.Type.DATE});
        const startFilter = search.createFilter({
            name: 'custcol_agency_mf_flight_end_date',
            operator: search.Operator.ONORAFTER,
            values: startval
        });
        const endFilter = search.createFilter({
            name: 'custcol_agency_mf_flight_end_date',
            operator: search.Operator.ONORBEFORE,
            values: endval
        });
        searchFilter.push(startFilter, endFilter);

        return searchFilter;
    }

    FCUtil.csvString = (cvsObjs) => {
        var csvArray = [];
        var keys = [];
        Object.keys(cvsObjs[0]).forEach(key => {
            keys.push(key);
        });
        csvArray.push(keys.join(','));
        cvsObjs.forEach(obj => {
            var values = [];
            Object.keys(obj).forEach(key => {
                var value = '';
                if (obj[key] == undefined) {
                    log.debug({
                        title: 'object key in csv was undefined',
                        details: JSON.stringify(obj) + ' : ' + key
                    });
                } else {
                    value = (obj[key].toString().includes(','))
                    ? ('\"' + obj[key] + '\"')
                    : obj[key];
                }
                values.push(value);
            });
            csvArray.push(values.join(','));
        });
        return csvArray.join('\n');
    }

    FCUtil.grabFile = (filename) => {
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

    FCUtil.processCSV = (file) => {
        const iterator = file.lines.iterator();

        let keys = [];
        let key = '';
        let csvObjArray = [];

        // add header as object keys
        iterator.each(line =>{
            const header = line.value.toLowerCase().replace(/\s/g, '')
            keys = csvSplit(header);
            keys.map(k => {
                if (k.includes('(')) return k.substring(0,k.indexOf('('))
                return k
            });
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

    return FCUtil;
});