export const validate = (schema, property = "body") => {
    return (req, res, next) => {
        // Handle cases where the property might not exist on the request
        if (!req[property]) {
            req[property] = {};
        }

        const { error, value } = schema.validate(req[property], {
            abortEarly: false,   // return all errors
            stripUnknown: true,  // remove unknown fields automatically
            escapeHtml: true,    // helps prevent XSS
            convert: true        // attempt to convert values to required types
        });

        if (error) {
            return res.status(400).json({
                status: "fail",
                message: "Validation error",
                details: error.details.map(err => {
                    // Clean up error messages for better client experience
                    return err.message.replace(/["']/g, '');
                }),
            });
        }

        // Handle different property types appropriately
        switch (property) {
            case 'query':
                // For query parameters, merge to preserve other query params
                Object.assign(req.query, value);
                break;
            case 'params':
                // For route parameters, replace entirely as they're typically fixed
                req.params = value;
                break;
            case 'body':
                // For body, replace entirely to ensure no unexpected fields remain
                req.body = value;
                break;
            case 'headers':
                // For headers, merge to preserve other headers
                Object.assign(req.headers, value);
                break;
            default:
                // For custom properties, assign directly
                req[property] = value;
        }

        next();
    };
};