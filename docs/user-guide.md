# User Guide

## What is Access Review Toolbox?

Access Review Toolbox is a portable Windows application for performing access and security reviews across enterprise platforms including Active Directory, Fortigate firewalls, and F5 BIG-IP (WAF).

The tool connects to each platform, takes a snapshot of the relevant data (a "dump"), and then analyses that snapshot to surface findings — accounts, policies, or configurations that may need remediation. All data is stored locally on your machine.

---

## System Requirements

- Windows 10/11 or Windows Server 2016 or later
- PowerShell 5.1 or later (included in all supported Windows versions)
- A modern browser: Chrome, Edge, or Firefox
- **For Active Directory reviews:** the machine must be domain-joined, or you must be able to connect to a domain controller. The RSAT (Remote Server Administration Tools) `ActiveDirectory` PowerShell module must be installed.
- **For Fortigate and F5 reviews:** network access to the management interface of the device and valid API credentials.

---

## Installation

1. Copy the `access-review-toolbox` folder to any location on your machine (e.g., `C:\Tools\access-review-toolbox\`).
2. No installation or administrator rights are required for the application itself.
3. Optionally, create a shortcut to `Launch.bat` on your desktop.

> The application is fully portable. You can copy the entire folder to another machine and it will work immediately.

---

## First Launch

1. Double-click `Launch.bat` inside the project folder.
2. A PowerShell window will open — this is the application server. **Do not close it** while using the tool.
3. Your default browser will open automatically to `http://localhost:8743/`.

If the browser does not open automatically, navigate to `http://localhost:8743/` manually.

To stop the application, close the PowerShell window or press `Ctrl+C` inside it.

---

## Setting Up a Config File

Most platform modules (Fortigate, F5) require credentials and a host address before they can collect data. These are stored in a local config file on your machine.

**The config file is never committed to any repository and never leaves your machine.**

### Creating a new config file

1. Click **New Config** in the left sidebar.
2. Fill in the details for each platform you intend to use:
   - **Fortigate Host** — the base URL of the FortiOS management interface, e.g. `https://192.168.1.1`
   - **Fortigate API Token** — an API token generated in FortiOS under System → Administrators
   - **F5 Host** — the base URL of the BIG-IP management interface, e.g. `https://192.168.1.2`
   - **F5 Username / Password** — a BIG-IP admin account with REST API access
3. Click **Save** and choose a location. The file will be saved as a `.json` file.
4. Leave the Active Directory section blank — AD uses your current Windows login automatically.

### Loading an existing config file

1. Click **Load Config** in the left sidebar.
2. Browse to your saved config file and select it.
3. The sidebar will confirm the config is loaded with the filename displayed.

Your last-used config file path is remembered between sessions, so you only need to load it once per machine.

---

## Performing a Review

The review workflow is the same for every platform module:

1. **Select a module** from the left sidebar (e.g., "Active Directory").
2. **Select or create a config file** if prompted.
3. Click **Create Dump** at the top of the screen.
4. Wait for the data collection to complete. A progress bar shows the current status.
5. Once the dump is complete, the data will load automatically into the tabs.
6. Click the **Findings** tab to see the analysis results.

---

## Active Directory Module

### What it collects

- All user accounts with their properties and group memberships
- All computer accounts
- All security and distribution groups with their members
- All Organisational Units (OUs) with their object counts

Collection uses your current Windows session credentials — no password prompt will appear.

### Tabs

| Tab | Contents |
|-----|----------|
| Users | All AD user accounts with key attributes |
| Computers | All AD computer accounts |
| Groups | All AD groups with member counts |
| OUs | All Organisational Units with object counts |
| Findings | Analysis results |

### Findings

| Finding | Description | Severity |
|---------|-------------|----------|
| Enabled users with no login ≥ 90 days | Active accounts that have not been used in 3 months. These may belong to departed users or unused service accounts. | High |
| Disabled users ≥ 180 days | Accounts that have been disabled for more than 6 months. These can typically be deleted. | Medium |
| Accounts set to never expire | User accounts where the expiration date is not set. | Medium |
| Accounts with password set to never expire | Accounts exempt from your password policy. | Medium |
| Groups with no members | Empty groups that may be redundant. | Low |
| OUs with no objects | Empty Organisational Units. | Low |

> **Note on disabled account age:** Active Directory does not record the exact date an account was disabled. The "last modified" date (`WhenChanged`) is used as a proxy. If an account was modified for any other reason after being disabled, the timer resets. Results should be verified manually.

---

## Fortigate Firewall Module

### What it collects

All firewall policy rules and their traffic statistics via the FortiOS REST API.

### Prerequisites

- Network access to the FortiOS management interface
- An API token with read access to policy and monitor data

To create an API token in FortiOS:
1. Go to **System → Administrators → Create New → REST API Admin**
2. Set the profile to at minimum read access for Firewall and Monitor
3. Copy the generated token into your config file

### Findings

| Finding | Description | Severity |
|---------|-------------|----------|
| Policies with no data transferred | Rules that have never matched any traffic. May be redundant or misconfigured. | Medium |
| Potential overlapping policies | Rules with the same source, destination, and service combination. The lower-priority rule may never be evaluated. | High |
| Policies allowing traffic to internet | Rules with `all` or an internet zone as the destination. Should be reviewed for scope. | High |
| Policies with any-any rules | Rules that allow any source to any destination. Extremely broad and should be tightened or removed. | High |

---

## F5 BIG-IP (WAF) Module

### What it collects

- All Application Security (ASM) security policies and their compliance status
- All LTM pools and their member servers

### Prerequisites

- Network access to the BIG-IP management interface (iControl REST API on port 443)
- An administrator account with REST API access

### Findings

| Finding | Description | Severity |
|---------|-------------|----------|
| Policies in learning mode | WAF policies set to transparent/learning mode are not actively blocking attacks. | High |
| Policies not at OWASP compliance score 10/10 | Policies with gaps in OWASP Top 10 coverage. | High |
| Pools with no associated security policy | Traffic pools not protected by any WAF policy. | Medium |

---

## Managing Dumps

Every time you click **Create Dump**, a new snapshot folder is created with the current date and time. Multiple dumps can be stored side by side.

### Viewing past dumps

Use the **dump selector dropdown** in the top bar to switch between stored dumps for the active module. The dropdown shows the date and time of each dump, newest first.

Dumps that were interrupted (e.g., by closing the PowerShell window mid-collection) appear greyed out and cannot be loaded.

### Where dumps are stored

Dumps are stored inside the project folder under:

```
access-review-toolbox\dumps\{Platform}\{YYYY-MM-DD_HH-mm-ss}\
```

For example:
```
dumps\AD\2026-05-10_14-30-00\
dumps\Fortigate\2026-05-10_15-00-00\
```

You can copy, archive, or share dump folders independently of the application. To load a dump on another machine, copy the full project folder including the `dumps\` directory.

### Refreshing findings

The **Refresh** button on the Findings tab re-runs the analysis against the currently loaded dump without re-collecting data from the platform. This is instant and does not require a network connection.

Use Refresh if you have switched between finding types or want to confirm the results after changing the dump selection.

---

## Troubleshooting

### The browser shows a connection error

The PowerShell server (`Launch.bat`) must be running. Check that the PowerShell window is still open. If it was closed, double-click `Launch.bat` again.

If port `8743` is already in use by another application, you will see a binding error in the PowerShell window. Close whatever is using that port, or edit `scripts\server.ps1` to use a different port number.

### "ActiveDirectory module not found"

The `ActiveDirectory` PowerShell module is not installed. Install RSAT on Windows 10/11:

1. Open **Settings → Apps → Optional Features → Add a feature**
2. Search for **RSAT: Active Directory Domain Services and Lightweight Directory Tools**
3. Install and restart PowerShell

On Windows Server, run:
```powershell
Install-WindowsFeature -Name RSAT-AD-PowerShell
```

### "Access denied" during AD collection

Your Windows account does not have read access to the Active Directory objects being queried. Contact your AD administrator to grant read permissions on the relevant OUs, or run `Launch.bat` as a user with domain read rights.

### Fortigate or F5 connection fails

- Confirm the host URL in your config is correct and includes `https://` (e.g., `https://192.168.1.1`).
- Confirm you can reach the management interface from this machine (try opening the URL in your browser).
- If the device uses a self-signed certificate, ensure `verifySsl` is set to `false` in your config.
- For Fortigate: verify the API token has not expired and has the required read permissions.
- For F5: verify the username and password are correct and the account has REST API access enabled.

### Dump appears greyed out in the dropdown

The dump folder exists but does not contain a valid `manifest.json`. This happens when data collection was interrupted. The dump cannot be loaded. You can safely delete the folder from `dumps\{Platform}\` manually and create a new dump.

### The findings count does not update after "Refresh"

Refresh re-analyses the data from the **currently loaded dump** — it does not re-collect live data. If the live environment has changed, create a new dump to capture the latest state.

---

## Data Privacy

All data collected by the tool stays on your local machine inside the `dumps\` folder. Nothing is sent to any external service. API calls go only to the platform management interfaces you have configured.

The config file containing your credentials is stored wherever you choose to save it. It is excluded from the git repository by `.gitignore`. Do not store it inside any folder that syncs to a cloud service or shared drive.
