#! /usr/bin/env node
const os = require("os");
const fs = require("fs");
const yargs = require('yargs');
const axios = require('axios');
const HTMLParser = require('node-html-parser');
const timeAgo = require('node-time-ago');
const options = yargs
  .usage('Usage: -n <number> -p <password>')
  .option('n', { alias: 'phone', describe: 'Phone number, format 33000000000', type: 'string', demandOption: true })
  .option('p', { alias: 'password', describe: 'Password', type: 'string', demandOption: true })
  .option('t', { alias: 'trackInternet', describe: 'Track internet traffic consumption between checks and show delta', type: 'boolean', demandOption: false })
  .option('d', { alias: 'domain', describe: 'Domain, www.lycamobile.fr by default', default: 'www.lycamobile.fr', type: 'string' })
  .option('r', { alias: 'maxRetries', describe: 'Max number of retries to retrieve data', default: 10, type: 'number' })
  .argv;

const tempDir = os.tmpdir();
const tempFilePath = `${tempDir}/lycamobile-${options.phone}.json`;

const writeTempFile = (path, data) => {
  try {
    fs.writeFileSync(path, JSON.stringify(data), { flag: 'w' });
    return true;
  } catch (err) { return false; }
}

const readTempFile = (path) => {
  try {
    const data = fs.readFileSync(path);
    return JSON.parse(data.toString());
  } catch (err) { return false; }
}

const trackInternetUsage = (path, data) => {
  const oldData = readTempFile(path);
  const newValue = parseFloat(data['internet'], 10);
  const oldValue = parseFloat(oldData['internet'], 10);
  if (!isNaN(newValue) && !isNaN(oldValue) && newValue > 0) {
    const delta = (oldValue - newValue).toFixed(2) * 1;
    if (delta > 0) {
      data['internet'] += ` \x1b[31m-${delta}GB\x1b[0m`;
    } else {
      data['internet'] += ` \x1b[2mno changes\x1b[0m`;
    }
    data['internet'] += ` \x1b[2m${timeAgo(oldData.checked)}\x1b[0m`;
  }
  writeTempFile(path, data);
  delete data['checked'];
  return data;
}

const printOutput = (data) => {
  let output = '';
  for (let [key, value] of Object.entries(data)) {
    output += `\x1b[36m* ${key.replace('_', ' ')}:\x1b[0m \x1b[32m${value}\x1b[0m\n`;
  }
  process.stdout.write(output);
};

const exitWithError = (err) => {
  process.stdout.write(`
(!) ${err}
  `);
  process.exit(1);
}

const getAuthCookie = async (domain, phone, password) => {
  try {
    const res = await axios.post(`https://${domain}/wp-admin/admin-ajax.php`, {
      action: 'lyca_login_ajax',
      method: 'login',
      mobile_no: phone,
      pass: password,
    }, {
      maxRedirects: 1,
      headers: {
        Accept: 'application/json',
        Referer: `https://${domain}/en/`,
        Origin: `https://${domain}/en/bundles/`,
        Cookie: 'wp-wpml_current_language=en;',
        'Accept-Language': 'en-us',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (res.data.is_error === true) return exitWithError(res.data.message || 'Unknown error');
    return res.headers['set-cookie'].join('; ');
  } catch (err) {
    return exitWithError(`Auth error: ${err}` || 'unknown');
  }
}

const getAccountHTML = async (domain, cookie) => {
  try {
    const res = await axios.get(`https://${domain}/en/my-account/`, {
      withCredentials: true,
      headers: {
        Cookie: cookie,
        Referer: `https://${domain}/en/my-account/`,
        Origin: `https://${domain}/en/my-account/`,
        'Accept-Language': 'en-us',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15',
      },
    });
    return res.data;
  } catch (err) { }
}

const isMyAccountPage = (html) => {
  try {
    const root = HTMLParser.parse(html);
    return root.querySelector('title').text.toLowerCase().indexOf('account') !== -1;
  } catch (err) { }
}

const parseAccountHTML = (html) => {
  try {
    const root = HTMLParser.parse(html);
    const phone = root.querySelector('.bdl-msisdn').text;
    const balance = (root.querySelector('span.myaccount-lowbalance').text)
      .replace('\nTopup', '');
    
    const expiration = [];
    const expElements = [...root.querySelectorAll('p.bdl-balance > span')
      .map((el) => el.text
      .replace('| ', '')
      .replace(/\s\s+/g, ' ')
    )];

    expElements.forEach((el, i) => {
      if (expElements[i] && expElements[i + 1] && i % 2 === 0) {
        expiration.push(expElements[i + 1].match(/\b\d{2}-\d{2}-\d{4}\b/) || [null]);
      }
    });

    const internet = [...root.querySelectorAll('div.bdl-mins')
      .map((el) => {
      const element = el.text.replaceAll('\n', '');
      if (element !== 'U' && element !== 'Unlimited' && element != 0) return element;
    })].filter(el => el !== undefined);
    
    return {
      phone,
      balance,
      internet: internet.join(', ') || 'unknown',
      expiration: expiration.join(', ') || 'unknown',
    };
  } catch (err) {
    return exitWithError(`Parsing error: ${err}` || 'unknown');
  }
}

(async () => {
  let retries = 0;
  let cookie = await getAuthCookie(options.domain, options.phone, options.password);
  let html = await getAccountHTML(options.domain, cookie);
  while (!isMyAccountPage(html) && retries < options.maxRetries - 1) {
    html = await getAccountHTML(options.domain, cookie);
    retries += 1;
  }
  
  if (retries === options.maxRetries) {
    return exitWithError(`Max number of tries exhausted with error: ${err}` || 'unknown');
  }
  
  let data = parseAccountHTML(html);
  
  if (options.trackInternet) {
    data = trackInternetUsage(tempFilePath, { ...data, checked: new Date() });
  } else {
    try { fs.unlinkSync(tempFilePath); } catch {}
  }
  
  printOutput(data);
})()
