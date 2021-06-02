define([
    "N/search",
    "N/file",
    "N/runtime",
    "N/log",
    "./FCUtil"
], function (s, file, runtime, log, FCUtil) {

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

    const commonFields = ['salesrep', 'class', 'amount'];
    const nonOrderFields = ['custcolforecast_inclusion', 'probability'];

    const typesDictionary = {
        opportunity: {
            id: 'tranid',
            label: 'Opportunities',
            fields: commonFields.concat(nonOrderFields),
            searchFilter: 'Opprtnty'
        },
        estimate: {
            id: 'tranid',
            label: 'Proposals',
            fields: commonFields.concat(nonOrderFields),
            searchFilter: 'Estimate'
        },
        salesorder: {
            id: 'tranid',
            label: 'Orders',
            fields: commonFields,
            searchFilter: 'SalesOrd'
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

        FCUtil.dateIndex(filter).forEach(dateObj => {
            let { month, year } = dateObj;
            let dateStr = (month + 1)+'/1/'+year;
            let filters = {};

            Object.keys(typesDictionary).forEach(type => {
                filters[type] = FCUtil.searchFilter(
                    typesDictionary[type].searchFilter,
                    month,
                    year
                );
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
        return (FCUtil.dateIndex(filter).filter(d => (d.year === year && d.month === month)).length > 0);
    };

    function getQuotas(filter) {
        const quotaCSV = FCUtil.grabFile('quotaResults.csv');
        if (!quotaCSV) return;
        log.audit({title: 'quotaResults CSV successfully loaded'});

        FCUtil.processCSV(quotaCSV).forEach(quotaline => {
            let { date, salesrep, property, amountmonthly } = quotaline;
            if (dateInRange(filter, date)) {
                if (!defineCalc(date, salesrep, property)) return;
                calcs[date][salesrep][property].quota = amountmonthly;
            }
        });
    }

    function updateForecastTotalsCSV() {
        var csvObjs = [];
        const totalsCSV = FCUtil.grabFile('forecastTotals.csv');
        if (totalsCSV) {
            log.audit({title: 'forecastTotals CSV successfully loaded'});
            csvObjs = FCUtil.processCSV(totalsCSV);
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
                        if (value || value === 0) csvObjs[index][key] = value;
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

        const csvContent = FCUtil.csvString(csvObjs);

        var newCSV = file.create({
            name: 'forecastTotals.csv',
            fileType: file.Type.CSV,
            contents: csvContent
        });
        // file id is hard coded here (prod environment)
        newCSV.encoding = file.Encoding.UTF_8;
        newCSV.folder = 4579;

        const fileId = newCSV.save();
        log.audit({title: 'saving forecastTotals CSV with file id: ' + fileId});
    }

    exports.execute = execute;
    return exports;
});
