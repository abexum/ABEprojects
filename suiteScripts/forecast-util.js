define(["N/search", "N/file", "N/format", "N/runtime", "N/log"],
    function (s, file, format, runtime, log) {

    /**
     * Backfill task to populate forecastTotals.csv used in Forecast Suitelets
     *
     * @exports forecast-backfill
     *
     * @copyright AC Business Media
     * @author Ashe B Exum <abexum@gmail.com>
     *
     * @requires N/search
     * @requires N/file
     * @requires N/format
     * @requires N/runtime
     * @requires N/task
     * @requires N/log
     *
     * @NApiVersion 2.1
     * @NModuleScope SameAccount
     * @NScriptType ScheduledScript
     */
    const exports = {};

    /**
     * <code>execute</code> event handler
     *
     * @governance 10,000
     *
     * @param context
     *        {Object}
     *
     * @return {void}
     *
     * @static
     * @function execute
     */

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

    function searchFilter(transactionType, month, year) {
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
        
        if (transactionType === 'salesorder') {
            const cancelledFilter = s.createFilter({
                name: 'custcolcancelled_line',
                operator: s.Operator.ISNOT,
                values: true,
            });
            searchFilter.push(cancelledFilter);
        }

        const startdate = new Date(year, month, 1);
        const enddate = new Date(year, month + 1, 0);

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

    exports.execute = execute;
    return exports;
});
