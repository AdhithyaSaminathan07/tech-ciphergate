const errorHandler = (err, req, res, next) => {
    // Log detailed error and stack trace internally for debugging
    console.error(`[Error] ${err.message}`);
    console.error(err.stack);

    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  
    res.status(statusCode);
    res.json({
      message: err.message || 'Internal Server Error',
      // Never expose stack trace in API response to prevent path/information leakage
    });
};
  
module.exports = { errorHandler };