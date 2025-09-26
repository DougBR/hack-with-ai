import Database from 'better-sqlite3';
import fs from 'fs';

// Initialize database
const db = new Database('etf_data.db');

// Create table with all required columns
const createTableSQL = `
CREATE TABLE IF NOT EXISTS etfs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    aum REAL NOT NULL,
    avg_daily_volume INTEGER NOT NULL,
    current_price REAL,
    risk_rating TEXT CHECK(risk_rating IN ('Low', 'Medium', 'High')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(createTableSQL);

// ETF data with risk ratings
const etfData = [
    { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', aum: 767718000.00, volume: 7170909, price: 609.50, risk: 'Medium' },
    { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', aum: 685945000.00, volume: 5890335, price: 608.45, risk: 'Medium' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', aum: 666832000.00, volume: 70781391, price: 609.12, risk: 'Medium' },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', aum: 544771000.00, volume: 3581303, price: 316.59, risk: 'Medium' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust Series I', aum: 383170000.00, volume: 47113188, price: 505.80, risk: 'High' },
    { symbol: 'VUG', name: 'Vanguard Growth ETF', aum: 194360000.00, volume: 911595, price: 432.15, risk: 'High' },
    { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', aum: 176297000.00, volume: 11632580, price: 52.84, risk: 'Medium' },
    { symbol: 'IEFA', name: 'iShares Core MSCI EAFE ETF', aum: 153574000.00, volume: 10518893, price: 81.42, risk: 'Medium' },
    { symbol: 'VTV', name: 'Vanguard Value ETF', aum: 148313000.00, volume: 2845863, price: 186.73, risk: 'Low' },
    { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', aum: 138842000.00, volume: 6379968, price: 73.25, risk: 'Low' },
    { symbol: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', aum: 131741000.00, volume: 8647149, price: 95.42, risk: 'Low' },
    { symbol: 'IWF', name: 'iShares Russell 1000 Growth ETF', aum: 121165000.00, volume: 1005112, price: 381.25, risk: 'High' },
    { symbol: 'GLD', name: 'SPDR Gold Shares', aum: 120528000.00, volume: 10422553, price: 242.88, risk: 'Medium' },
    { symbol: 'IEMG', name: 'iShares Core MSCI Emerging Markets ETF', aum: 109828000.00, volume: 9730182, price: 49.76, risk: 'High' },
    { symbol: 'VGT', name: 'Vanguard Information Technology ETF', aum: 107511000.00, volume: 477306, price: 629.45, risk: 'High' },
    { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', aum: 105885000.00, volume: 4226258, price: 69.23, risk: 'Medium' },
    { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', aum: 101840000.00, volume: 8375437, price: 44.12, risk: 'High' },
    { symbol: 'IJH', name: 'iShares Core S&P Mid-Cap ETF', aum: 99277300.00, volume: 7152972, price: 329.84, risk: 'Medium' },
    { symbol: 'VIG', name: 'Vanguard Dividend Appreciation ETF', aum: 97765200.00, volume: 841105, price: 192.67, risk: 'Low' },
    { symbol: 'VO', name: 'Vanguard Mid-Cap ETF', aum: 88969900.00, volume: 618138, price: 312.45, risk: 'Medium' },
    { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', aum: 88861800.00, volume: 7318265, price: 228.92, risk: 'High' },
    { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', aum: 87224700.00, volume: 44376746, price: 88.45, risk: 'High' },
    { symbol: 'IJR', name: 'iShares Core S&P Small-Cap ETF', aum: 85460600.00, volume: 4719514, price: 127.83, risk: 'High' },
    { symbol: 'SPLG', name: 'SPDR Portfolio S&P 500 ETF', aum: 85095100.00, volume: 8779334, price: 68.92, risk: 'Medium' },
    { symbol: 'ITOT', name: 'iShares Core S&P Total U.S. Stock Market ETF', aum: 77327800.00, volume: 1651326, price: 134.67, risk: 'Medium' },
    { symbol: 'RSP', name: 'Invesco S&P 500® Equal Weight ETF', aum: 73975400.00, volume: 12513949, price: 185.34, risk: 'Medium' },
    { symbol: 'IWM', name: 'iShares Russell 2000 ETF', aum: 71259900.00, volume: 36609734, price: 231.45, risk: 'High' },
    { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', aum: 70981000.00, volume: 16201465, price: 84.73, risk: 'Low' },
    { symbol: 'BNDX', name: 'Vanguard Total International Bond ETF', aum: 70142000.00, volume: 3337143, price: 48.92, risk: 'Low' },
    { symbol: 'VB', name: 'Vanguard Small Cap ETF', aum: 68297400.00, volume: 827414, price: 234.78, risk: 'High' },
    { symbol: 'EFA', name: 'iShares MSCI EAFE ETF', aum: 66605600.00, volume: 13499388, price: 86.21, risk: 'Medium' },
    { symbol: 'VYM', name: 'Vanguard High Dividend Yield Index ETF', aum: 65705300.00, volume: 1095812, price: 124.89, risk: 'Low' },
    { symbol: 'IVW', name: 'iShares S&P 500 Growth ETF', aum: 65395500.00, volume: 1976280, price: 99.84, risk: 'High' },
    { symbol: 'IWD', name: 'iShares Russell 1000 Value ETF', aum: 63683500.00, volume: 2335295, price: 189.23, risk: 'Low' },
    { symbol: 'QQQM', name: 'Invesco NASDAQ 100 ETF', aum: 62849700.00, volume: 3246106, price: 217.45, risk: 'High' },
    { symbol: 'SCHX', name: 'Schwab U.S. Large-Cap ETF', aum: 60516800.00, volume: 10850911, price: 62.84, risk: 'Medium' },
    { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', aum: 57945000.00, volume: 11993882, price: 100.12, risk: 'Low' },
    { symbol: 'IAU', name: 'iShares Gold Trust', aum: 57905400.00, volume: 6880252, price: 49.23, risk: 'Medium' },
    { symbol: 'VCIT', name: 'Vanguard Intermediate-Term Corporate Bond ETF', aum: 55980200.00, volume: 11606042, price: 85.67, risk: 'Low' },
    { symbol: 'VT', name: 'Vanguard Total World Stock ETF', aum: 54490500.00, volume: 2701220, price: 120.45, risk: 'Medium' },
    { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', aum: 53096200.00, volume: 36405441, price: 48.92, risk: 'Medium' },
    { symbol: 'QUAL', name: 'iShares MSCI USA Quality Factor ETF', aum: 52590100.00, volume: 1442160, price: 159.84, risk: 'Low' },
    { symbol: 'SCHF', name: 'Schwab International Equity ETF', aum: 51245800.00, volume: 9064060, price: 42.67, risk: 'Medium' },
    { symbol: 'VEU', name: 'Vanguard FTSE All-World ex-US Index Fund', aum: 50493600.00, volume: 2804051, price: 69.84, risk: 'Medium' },
    { symbol: 'SCHG', name: 'Schwab U.S. Large-Cap Growth ETF', aum: 50296800.00, volume: 9252262, price: 195.23, risk: 'High' },
    { symbol: 'IXUS', name: 'iShares Core MSCI Total International Stock ETF', aum: 49197300.00, volume: 1659946, price: 78.45, risk: 'Medium' },
    { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', aum: 47863200.00, volume: 36989500, price: 91.23, risk: 'Medium' },
    { symbol: 'VV', name: 'Vanguard Large Cap ETF', aum: 46034600.00, volume: 219486, price: 295.67, risk: 'Medium' },
    { symbol: 'IWR', name: 'iShares Russell Midcap ETF', aum: 44651900.00, volume: 1615531, price: 82.34, risk: 'Medium' },
    { symbol: 'IWB', name: 'iShares Russell 1000 ETF', aum: 43661300.00, volume: 917252, price: 298.45, risk: 'Medium' },
    { symbol: 'SPYG', name: 'SPDR Portfolio S&P 500 Growth ETF', aum: 43222100.00, volume: 2318529, price: 76.89, risk: 'High' }
];

// Risk rating logic explanation:
// Low: Bonds, dividend-focused funds, value funds (stable, lower volatility)
// Medium: Broad market index funds, international developed markets, gold
// High: Growth funds, tech sector, small caps, emerging markets, crypto, leveraged ETFs

// Prepare insert statement
const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO etfs (symbol, name, aum, avg_daily_volume, current_price, risk_rating)
    VALUES (?, ?, ?, ?, ?, ?)
`);

// Insert all ETF data
const insertMany = db.transaction((etfs) => {
    for (const etf of etfs) {
        insertStmt.run(etf.symbol, etf.name, etf.aum, etf.volume, etf.price, etf.risk);
    }
});

try {
    insertMany(etfData);
    console.log(`Successfully inserted ${etfData.length} ETF records`);
} catch (error) {
    console.error('Error inserting data:', error);
}

// Function to fetch real-time prices (placeholder for API integration)
async function updatePricesFromAPI() {
    // This is a placeholder function. In production, you would:
    // 1. Use a financial API like Alpha Vantage, Yahoo Finance API, or IEX Cloud
    // 2. Implement rate limiting and error handling
    // 3. Update prices in batches
    
    console.log('Price update function - integrate with your preferred financial API');
    
    // Example API structure (commented out):
    /*
    const updatePriceStmt = db.prepare('UPDATE etfs SET current_price = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?');
    
    for (const etf of etfData) {
        try {
            // const response = await fetch(`https://api.example.com/quote/${etf.symbol}`);
            // const data = await response.json();
            // updatePriceStmt.run(data.price, etf.symbol);
        } catch (error) {
            console.error(`Failed to update price for ${etf.symbol}:`, error);
        }
    }
    */
}

// Query functions for easy data retrieval
const queries = {
    // Get all ETFs
    getAllETFs: () => db.prepare('SELECT * FROM etfs ORDER BY aum DESC').all(),
    
    // Get ETFs by risk rating
    getByRisk: (riskLevel) => db.prepare('SELECT * FROM etfs WHERE risk_rating = ? ORDER BY aum DESC').all(riskLevel),
    
    // Get top N ETFs by AUM
    getTopByAUM: (limit = 10) => db.prepare('SELECT * FROM etfs ORDER BY aum DESC LIMIT ?').all(limit),
    
    // Get ETFs with high volume
    getHighVolume: (minVolume = 1000000) => db.prepare('SELECT * FROM etfs WHERE avg_daily_volume >= ? ORDER BY avg_daily_volume DESC').all(minVolume),
    
    // Search by name or symbol
    search: (term) => db.prepare('SELECT * FROM etfs WHERE symbol LIKE ? OR name LIKE ? ORDER BY aum DESC').all(`%${term}%`, `%${term}%`),
    
    // Get summary statistics
    getSummaryStats: () => db.prepare(`
        SELECT 
            risk_rating,
            COUNT(*) as count,
            AVG(current_price) as avg_price,
            SUM(aum) as total_aum,
            AVG(avg_daily_volume) as avg_volume
        FROM etfs 
        GROUP BY risk_rating
        ORDER BY total_aum DESC
    `).all()
};

// Example usage and testing
console.log('\n=== ETF Database Setup Complete ===');
console.log('Sample queries:');

console.log('\nTop 5 ETFs by AUM:');
console.table(queries.getTopByAUM(5));

console.log('\nRisk Rating Summary:');
console.table(queries.getSummaryStats());

console.log('\nHigh Risk ETFs:');
console.table(queries.getByRisk('High').slice(0, 5));

// Export for use in other modules
export {
    db,
    queries,
    updatePricesFromAPI
};

// Close database connection when script ends
process.on('exit', () => {
    db.close();
    console.log('\nDatabase connection closed.');
});
