
// Helper function to safely parse date strings
export function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;

    // Match various formats, including YY.MM.DD, YYYY-MM-DD, etc.
    const match = dateString.match(/^(\d{2,4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})$/);
    if (match) {
        let [_, year, month, day] = match.map(n => parseInt(n, 10));
        if (year < 100) year += 2000; // Handle YY format
        return new Date(year, month - 1, day);
    }
    return null;
}

// Helper to get all property names from a model
export async function getAllPropertyNames(model) {
    if (!model) return [];
    return new Promise((resolve, reject) => {
        model.getBulkProperties([], {}, (results) => {
            const propNames = new Set();
            for (const result of results) {
                for (const prop of result.properties) {
                    propNames.add(prop.displayName);
                }
            }
            resolve(Array.from(propNames).sort());
        }, reject);
    });
}

// Helper to collect phasing data based on a date property and duration
export async function collectPhasingData(model, datePropertyName, duration) {
    if (!model || !datePropertyName || isNaN(duration)) return [];

    const getLeafNodes = () => new Promise((resolve, reject) => {
        model.getObjectTree(tree => {
            const leaves = [];
            tree.enumNodeChildren(tree.getRootId(), dbid => {
                if (tree.getChildCount(dbid) === 0) leaves.push(dbid);
            }, true);
            resolve(leaves);
        }, reject);
    });

    const getProperties = (dbids) => new Promise((resolve, reject) => {
        model.getBulkProperties(dbids, { propFilter: [datePropertyName, 'Name'] }, resolve, reject);
    });

    const leafIds = await getLeafNodes();
    const results = await getProperties(leafIds);
    
    const phasingData = [];
    for (const result of results) {
        const dateProp = result.properties.find(p => p.displayName === datePropertyName);
        const nameProp = result.properties.find(p => p.displayName === 'Name');

        if (dateProp && dateProp.displayValue) {
            const startDate = parseDate(dateProp.displayValue);
            if (startDate) {
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + duration);
                phasingData.push({
                    dbid: result.dbId,
                    name: nameProp ? nameProp.displayValue : `ID: ${result.dbId}`,
                    startDate: startDate,
                    endDate: endDate
                });
            }
        }
    }
    return phasingData;
}

// Helper to find occurrences of a specific property value
export async function findPropertyValueOccurrences(model, propName) {
    const getLeafNodes = () => new Promise((resolve, reject) => {
        model.getObjectTree(tree => {
            const leaves = [];
            tree.enumNodeChildren(tree.getRootId(), dbid => {
                if (tree.getChildCount(dbid) === 0) leaves.push(dbid);
            }, true);
            resolve(leaves);
        }, reject);
    });

    const dbids = await getLeafNodes();
    return new Promise((resolve, reject) => {
        model.getBulkProperties(dbids, { propFilter: [propName] }, (results) => {
            const histogram = new Map();
            for (const result of results) {
                if (result.properties.length > 0) {
                    const key = result.properties[0].displayValue;
                    if (histogram.has(key)) {
                        histogram.get(key).push(result.dbId);
                    } else {
                        histogram.set(key, [result.dbId]);
                    }
                }
            }
            resolve(histogram);
        }, reject);
    });
}
