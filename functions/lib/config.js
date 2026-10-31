export function validateNotificationConfig(config){
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('PERMIT_NOTIFICATION_CONFIG must be a JSON object.');
 const services=[['solapi',['apiKey','apiSecret','from']],['microsoft365',['tenantId','clientId','clientSecret','sender']]];
 if(!services.some(([service])=>config[service]))throw Error('Configure SOLAPI or Microsoft 365 before deploying notifications.');
 for(const [service,keys] of services){if(!(service in config))continue;for(const key of keys)if(typeof config[service]?.[key]!=='string'||!config[service][key].trim())throw Error(`PERMIT_NOTIFICATION_CONFIG needs ${service}.${key}.`);}
 if(config.solapi&&!/^0\d{8,10}$/.test(config.solapi.from.replace(/\D/g,'')))throw Error('SOLAPI needs a valid registered sender number.');
 return config;
}
export function enabledChannels(config){const channels=[];if(config?.solapi)channels.push('sms');if(config?.microsoft365)channels.push('email');return channels.length?channels:['sms','email'];}
