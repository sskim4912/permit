import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {createNotifyHandler} from './lib/http.js';
initializeApp();const notificationConfig=defineSecret('PERMIT_NOTIFICATION_CONFIG');
export const notifyPermit=onRequest({region:'asia-northeast3',cors:['https://permit-daesan-461e8.web.app','https://permit-daesan-461e8.firebaseapp.com'],timeoutSeconds:300,memory:'256MiB',maxInstances:3,secrets:[notificationConfig]},createNotifyHandler({db:getFirestore(),Timestamp,getConfig:()=>JSON.parse(notificationConfig.value()||'{}')}));
