import React, { useState } from 'react'
import axios from 'axios';

const StockSearch = () => {

    const [stockData, setStockData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stockName, setStockName] = useState('ACE')
    const [dataLoading, setDataLoading] = useState(false)

    const fetchStockData = async () => {
        const options = {
            method: 'GET',
            url: 'https://indian-stock-exchange-api2.p.rapidapi.com/stock',
            params: { name: stockName.toUpperCase() },
            headers: {
                'x-rapidapi-key': '6be3c60e32msh3d1e2e2c12c3554p17ae54jsn280b15bafacc',
                'x-rapidapi-host': 'indian-stock-exchange-api2.p.rapidapi.com'
            }
        };

        try {
            setLoading(true);
            setDataLoading(true)
            const response = await axios.request(options);
            setStockData(response.data);
            console.log(response.data);
            setError(null);
            setLoading(false)
            setDataLoading(false)
        } catch (err) {
            console.error(err);
            setError(err.error || 'Failed to fetch stock data');
            setLoading(false)
            setDataLoading(false)
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {error ? <h2>{error}</h2> :
                <main className='container'>
                    <h2>Stock: {stockName || '— not selected —'}</h2>

                    <div className='row'>
                        <div className='col'>
                            <input
                                type="text"
                                className="form-control"
                                value={stockName}
                                onChange={(e) => setStockName(e.target.value)}
                                placeholder="Enter stock name or ticker (e.g. RELIANCE, TCS)"
                            />
                        </div>

                        <div className='col'>
                            <button className='btn btn-warning' onClick={fetchStockData}>Search</button>
                        </div>

                        <p>Uppercase: {stockName.toUpperCase()}</p>
                    </div>

                    {!loading && error == null ? (
                        <div>
                            <h1>Details</h1>
                            <p>Date (IST) : {stockData.stockDetailsReusableData.date}</p>
                            <p>Company Name : {stockData.companyName}</p>
                            <p>Year High : {stockData.yearHigh}, Year Low : {stockData.yearLow}</p>
                            <p>Price BSE : {stockData.currentPrice.BSE}, Price NSE : {stockData.currentPrice.NSE}</p>
                            <p>Market Cap : {stockData.stockDetailsReusableData.marketCap}</p>
                            <p>Daily High : {stockData.stockDetailsReusableData.high} || Daily Low : {stockData.stockDetailsReusableData.low}</p>
                            <p>PE : {stockData.stockDetailsReusableData.sectorPriceToEarningsValueRatio}%</p>
                            <p>NSE Code : {stockData.companyProfile.exchangeCodeNse} , BSE Code : {stockData.companyProfile.exchangeCodeBse}</p>

                            <table className="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th>Dividend Type</th>
                                        <th>Dividend Value (₹)</th>
                                        <th>Record Date</th>
                                        <th>XD Date</th>
                                        <th>Announcement Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockData.stockCorporateActionData.dividend.map((item, index) => (
                                        <tr key={index}>
                                            <td>{item.companyName}</td>
                                            <td>{item.interimOrFinal}</td>
                                            <td>{item.value}</td>
                                            <td>{item.recordDate || "-"}</td>
                                            <td>{item.xdDate || "-"}</td>
                                            <td>{item.dateOfAnnouncement}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <main className='text-center'>
                            {dataLoading ? (
                                <>
                                    <div className="spinner-border text-warning" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <h3>Loading in Progress</h3>
                                </>
                            ) : null}
                        </main>
                    )}
                </main>
            }
        </>
    )
}

export default StockSearch
