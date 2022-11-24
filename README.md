A simple tool to get information from your LycaMobile account

```
Usage: lycamobile -n <number> -p <password>

Options:
      --help        Show help 
      --version     Show version number
  -n, --phone       Phone number, format 33000000000
  -p, --password    Password
  -d, --domain      Domain, www.lycamobile.fr by default
  -r, --maxRetries  Max number of retries to retrieve data
```

### Installation

```
npm install -g .
```

### Example of usage

```
lycamobile -n 33000000000 -p XYZXYZ

* phone: +33000000000
* balance: €9,32
* expiration: 19-03-2022
* internet: 42.55GB
```
