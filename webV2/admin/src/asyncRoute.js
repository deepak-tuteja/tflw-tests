// Express 4 doesn't forward a rejected async handler's promise to the error middleware on its
// own — wrapping every route in this catches that and calls next(err), so apiClient.js's
// ApiError reaches server.js's single error handler instead of crashing the process.
export function asyncRoute(handler) {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
