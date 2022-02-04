const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { readFile } = require('fs').promises;
const { default: axios } = require('axios');
const FormData = require('form-data');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', async (request, response) => {
    console.log('app get executed')
    response.send( await readFile('./home.html', 'utf8') );

});

app.listen(process.env.PORT || 3000, () => console.log(`App available on http://localhost:3000`))

app.post('/wufoo', (req, res) => {
    let campaignid = req.query.campaignid;

    wufooToConvertr(req.body, campaignid);

    res.status(200).send();
});


const apiKey = '09dc6faddc1bc1ad1e3fb8771b6962199357';

async function getAccessTokenConvertr() {
  const tokenEndpoint = 
    'https://acbm.cvtr.io/oauth/v2/token?grant_type=http://convertr.cvtr.io/grants/api_key&client_id='
    + '3_16qhmrg5cnms84wgowowkcgksc04400occcwswcg88kc4swosc&client_secret=580h2l7ulbswk0g8oowc8wk0okcg8o4s48c8k4ks004gk88cg4&api_key='
    + apiKey;
  const response = await axios.get(tokenEndpoint);
  console.log('response data from Convertr access token GET');
  console.log(response.data);
  return response.data?.access_token;
}


async function wufooToConvertr(body, campaignid) {
  const fieldsEndpoint = 'https://acbm.cvtr.io/api/v2.4/publisher/fields/' + campaignid;
  // const linksEndpoint = 'https://acbm.cvtr.io/api/v2.4/publisher/links/' + campaignid;
  
  const access_token = await getAccessTokenConvertr();
  if (!access_token) {
    console.log('failed to acquire access token');
    return;
  }

  // Grab the fields from 
  const fieldsResponse = await axios.get(fieldsEndpoint + '?access_token=' + access_token);

  console.log('Convertr campaign fields GET response data');
  console.log(fieldsResponse?.data);
  const campaignFields = fieldsResponse?.data[0]?.fields;
  const formId = fieldsResponse?.data[0]?.formId

  // build post endpoint using the formId
  const postEndpoint = 'https://acbm.cvtr.io/api/v2.4/publisher/11003/forms/'
    +formId+'/campaign/'+campaignid+'/leads?access_token='+access_token;

  // Grab all the fields from the wufoo body
  let formFields = [];
  const fieldStructure = JSON.parse(body.FieldStructure);
  if (!fieldStructure.Fields) {
    console.log('Could not extract FieldStructure from wufoo POST body');
    console.log(fieldStructure);
    return;
  }
  fieldStructure.Fields.forEach(fieldData => {
    if (fieldData.SubFields) {
      fieldData.SubFields.forEach(subFieldData => {
        // console.log('adding form field ' + subFieldData.Label + fieldData.Title);
        formFields.push(subFieldData.ID);
      });
    } else {
      // console.log('adding form field ' + fieldData.Title);
      formFields.push(fieldData.ID);
    }
  });
  
  if (formFields.length !== campaignFields.length) {
    console.log('Warning : Form field count is not equal to campaign field count.');
  }

  // build out the body for Convertr lead post
  const formData = new FormData();
  const fieldCount = Math.min(formFields.length, campaignFields.length);
  // console.log('campaignFields');
  // console.log(campaignFields);
  // console.log('formFields');
  // console.log(formFields);
  for (let i=0; i < fieldCount; i++) {
    // console.log('adding form data');
    // console.log(campaignFields[i] + ' , ' + body[formFields[i]]);
    formData.append(campaignFields[i], body[formFields[i]]);
  }
  
  const postResponse = await axios.post(postEndpoint, formData, {
    headers: formData.getHeaders()
  })
  console.log('Convertr lead POST response data');
  console.log(postResponse.data);
}