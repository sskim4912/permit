const asText = value => String(value ?? '');
export const maskName = value => asText(value).replace(/[\s\S]$/u, '*');
export const maskLastFour = value => asText(value).replace(/[\s\S]{1,4}$/u, '****');
export function publicTeam({id,name,order,contacts}) {
  return {id,name,order,contacts: contacts.map(contact => ({
    name: maskName(contact.name),
    phone: maskLastFour(contact.phone),
    email: contact.email ? Array.from(contact.email)[0] + '***@***' : ''
  }))};
}
