export const validate = (schema, property = "body") => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,   // return all errors
            stripUnknown: true,  // remove unknown fields automatically
            escapeHtml: true     // helps prevent XSS
        });

        if (error) {
            return res.status(400).json({
                status: "fail",
                message: "Validation error",
                details: error.details.map(d => d.message),
            });
        }

        req[property] = value; // sanitized and validated input
        next();
    };
};
