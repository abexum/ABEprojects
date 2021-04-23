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

    const commonFields = ['salesrep', 'class', 'amount'];
    const nonOrderFields = ['custcolforecast_inclusion', 'probability'];

    const typesDictionary = {
        opportunity: {
            id: 'tranid',
            label: 'Opportunities',
            fields: commonFields.concat(nonOrderFields),
            searchFilter: ['Opprtnty']
        },
        estimate: {
            id: 'tranid',
            label: 'Proposals',
            fields: commonFields.concat(nonOrderFields),
            searchFilter: ['Estimate']
        },
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields,
            searchFilter: ['SalesOrd']
        },
    };

    function execute(context) {
        log.audit({title: 'Running Forecast Totals Backfill...'});

        const filter = getFilter(context.request);
        fullRecordedSearch(filter);
    }

    function getFilter() {
        const startdate = runtime.getCurrentScript().getParameter({name: 'custscript_backfill_startdate'});
        const startValue = startdate || new Date();

        return {
            startdate: startValue,
        }
    }

    const calcs = {};
    const defineCalc = (date, salesrep, property) => {
        if (!salesrep || !property) return 0;
        if (calcs[date] === undefined) calcs[date] = {};
        if (calcs[date][salesrep] === undefined) calcs[date][salesrep] = {};
        if (calcs[date][salesrep][property] === undefined) calcs[date][salesrep][property] = {};

        const { opportunity, estimate, salesorder, weighted, gross, universal, quota } = calcs[date][salesrep][property];
        if (!opportunity) calcs[date][salesrep][property].opportunity = 0;
        if (!estimate) calcs[date][salesrep][property].estimate = 0;
        if (!salesorder) calcs[date][salesrep][property].salesorder = 0;
        if (!weighted) calcs[date][salesrep][property].weighted = 0;
        if (!gross) calcs[date][salesrep][property].gross = 0;
        if (!universal) calcs[date][salesrep][property].universal = 0;
        if (!quota) calcs[date][salesrep][property].quota = '';

        return 1;
    }

    function fullRecordedSearch(filter) {
        // get quota from quotaCSV
        getQuotas(filter);
        
        // calculate these values for each rep, prop, month while searching records
        // opportunity, estimate, salesorder, weighted, gross, universal
        const incrementCalcs = (res, type, date) => {
            const salesrep = res.getText({name: 'salesrep'});
            const property = res.getText({name: 'class'});
            if (!defineCalc(date, salesrep, property)) return;
            const amount = res.getValue({name: 'amount'});
            const probability = res.getValue({name: 'probability'});
            const forecast = res.getValue({name: 'custcolforecast_inclusion'});

            const grossnum = parseFloat(amount);
            calcs[date][salesrep][property].universal+= grossnum;
            calcs[date][salesrep][property][type]+=grossnum;

            if (type !== 'salesorder') {
                if (forecast) {
                    const weightvalue = grossnum*(parseFloat(probability)/100);
                    calcs[date][salesrep][property].weighted+=weightvalue;
                    calcs[date][salesrep][property].gross+=grossnum;
                }
            } else {
                calcs[date][salesrep][property].weighted+=grossnum;
                calcs[date][salesrep][property].gross+=grossnum;
            }
        };

        dateIndex(filter).forEach(dateObj => {
            let { month, year } = dateObj;
            let dateStr = (month + 1)+'/1/'+year;
            let filters = {};

            Object.keys(typesDictionary).forEach(type => {
                filters[type] = searchFilter(type, month, year);
            });
            Object.keys(typesDictionary).forEach(type => {
                s.create({
                    type: s.Type.TRANSACTION,
                    filters: filters[type],
                    columns: typesDictionary[type].fields
                }).run().each(res => {
                    incrementCalcs(res, type, dateStr);
                    return true;
                });
            });  
        });

        // update forecastTotalsCSV without changing any of worstcase, mostlikely, upside, lastupdate
        updateForecastTotalsCSV();
    }

    const dateInRange = (filter, date) => {
        const dateObj = new Date(date);
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth();
        return (dateIndex(filter).filter(d => (d.year === year && d.month === month)).length > 0);
    };

    function getQuotas(filter) {
        const quotaCSV = grabFile('quotaResults.csv');
        if (!quotaCSV) return;
        log.audit({title: 'quotaResults CSV successfully loaded'});

        processCSV(quotaCSV).forEach(quotaline => {
            let { date, salesrep, property, amountmonthly } = quotaline;
            if (dateInRange(filter, date)) {
                if (!defineCalc(date, salesrep, property)) return;
                calcs[date][salesrep][property].quota = amountmonthly;
            }
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

    function updateForecastTotalsCSV() {
        var csvObjs = [];
        const totalsCSV = grabFile('forecastTotals.csv');
        if (totalsCSV) {
            log.audit({title: 'forecastTotals CSV successfully loaded'});
            csvObjs = processCSV(totalsCSV);
            const oldDataLines = [];
            // search for index of pre-existing data
            csvObjs.forEach((line, index) => {
                let { salesrep, property, date } = line;
                // check that date is in search period
                if (!calcs[date]) return;
                // replace old data with calcs
                if (calcs[date][salesrep]?.[property]) {
                    Object.keys(calcs[date][salesrep][property]).forEach(key => {
                        let value = calcs[date][salesrep][property][key];
                        if (value || value === 0) line[key] = value;
                    });
                    delete calcs[date][salesrep][property];
                } else {
                    // remove data not found in calcs
                    log.debug({
                        title: 'forecastTotals.csv line will be removed',
                        details: JSON.stringify(line)
                    });
                    oldDataLines.push(index);
                }
            });
            // remove data lines in reverse so index is always correct
            const totalRemovals = oldDataLines.length;
            for (let line = totalRemovals - 1; line >= 0; line--){
                csvObjs.splice(oldDataLines[line], 1);
            }
        }
        // add new lines for new data
        Object.keys(calcs).forEach(month => {
            Object.keys(calcs[month]).forEach(rep => {
                Object.keys(calcs[month][rep]).forEach(prop => {
                    const { weighted, gross, universal, opportunity, estimate, salesorder, quota } 
                        = calcs[month][rep][prop];
                    csvObjs.push({
                        salesrep: rep,
                        property: prop,
                        date: month,
                        worstcase: '',
                        mostlikely: '',
                        upside: '',
                        lastupdate: '',
                        weighted: weighted,
                        gross: gross,
                        universal: universal,
                        opportunity: opportunity,
                        estimate: estimate,
                        salesorder: salesorder,
                        quota: quota
                    });
                });
            });
        });

        const csvContent = csvString(csvObjs);

        var newCSV = file.create({
            name: 'forecastTotals.csv',
            fileType: file.Type.CSV,
            contents: csvContent
        });
        // file id is hard coded here (prod environment)
        newCSV.encoding = file.Encoding.UTF_8;
        newCSV.folder = 1020;
        
        const fileId = newCSV.save();
        log.audit({title: 'saving forecastTotals CSV with file id: ' + fileId});
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
