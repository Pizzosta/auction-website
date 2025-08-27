const emailConfig = {
  // SMTP configuration
  smtp: {
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || 'eslcqauj67dpeag6@ethereal.email',
      pass: process.env.EMAIL_PASS || 'pabgW62TYtg37qmkPS',
    },
    connectionTimeout: 30000, // 30 seconds
    greetingTimeout: 20000,   // 20 seconds
    socketTimeout: 30000
  },
  
  // Default from address
  from: {
    name: process.env.EMAIL_FROM_NAME || 'Kawodze Auctions',
    address: process.env.EMAIL_FROM || 'no-reply@kawodze-auctions.com'
  },
  
  // Email templates configuration
  templates: {
    dir: 'src/templates/emails',  // Relative to project root
    viewEngine: 'handlebars'
  },
  
  // Default template variables
  templateVars: {
    appName: process.env.APP_NAME || 'Kawodze Auctions',
    appUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    year: new Date().getFullYear()
  }
};

export default emailConfig;
