# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Standing Instructions

1. Update `Agent_Progress.md` while working on a feature — not after.
2. Update `CHANGELOG.md` with every change, grouped under `[Unreleased]`.
3. Commit with proper commit messages after every feature implementation or bug fix.
4. Run tests before committing — all must pass.
5. Commit format: `feat(scope):`, `fix(scope):`, `ci:`, `docs:`, `refactor(scope):`
---

## Requirements
- The frontend is built with simple HTML, CSS, and JavaScript. NO additional libraries or frameworks are required and should not require any building or compilation.
- The backend execution is done using purpose built PowerShell scripts.
- The Application must be portable and work on any windows environment by copying the project files to a new environment.
- The data that persists across sessions is only dumped snapshots from various digital platforms which are stored locally on the user's machine, which is prompted to be selected by the user on first launch.
- Have a modular approach which will enable each digital platform to be added as a separate module, this will allow for easy maintenance and extension of the application.
- For the initial release, the platforms supported will be Entra ID on Azure/ On-Prem, Azure Identities, O365 Groups/Applications/Sharepoint, Fortigate Firewall (Policy Reviews), F5 Firewall (Policy Reviews)
- There will be separate views for each platform, allowing the user to view and manage access reviews for each platform separately.
- Review Process : Selected a technology platform -> create dump of the relevant data -> analyze the data and create a findings report based on the review criteria -> the findings will be dislayed on the findings Tab.
- Whenever a dump is created and reviewed, it is stored locally on the user's machine and can be viewed and managed through the application's interface. The folder created for each dump is named with date and time of the dump, so that multiple dumps can be stored and managed separately. For every dump, the findings tab must allow a refresh feature that will allow fetching the current status of the findings from the dump. for example in a AD review dump, if all users without login for 90 days and still enabled is a finding type, when this snapshot is loaded again and status is refreshed, the tool must just refresh the current status of the findings from the dump. Similary in a Firewall review dump, if policy rules are expired or not compliant, these are findings that must be refreshed from the dump.
- AD data dumps can be done using powershell cmdlets.
- All other platforms can use their respective API's to fetch the relevant data.
- Also add an option to select a config file on launch or create one for configuring credentials and URLs for the platforms. For AD use the current user's privileges to fetch the data. The user must not be prompted for credentials or URLs until they want to run a specific module.

Modules to be implemented:
- AD Azure/On-Prem
  - this module dumps all user accounts, computer accounts, groups, OUs with all associated properties and memberships under separate files. This must be shown as tabs on the Active Directory view.
  - The findings tab must have six sections : 
    - User accounts with no login for more than or equal to 90 days and still enabled
    - User accounts that are disabled for more than or equal to 180 days.
    - Accounts set to never expire.
    - Accounts with password expiration set to never expire.
    - Groups with no members.
    - OUs with no objects.
- Fortigate Firewall:
  - this module dumps all firewall policy rules and their status, including expired or non-compliant rules. This must be shown as tabs on the Firewall view.
  - The findings tab must have four sections : 
    - Firewall policy rules with no data transfered.
    - Potential overlapping policies.
    - Policies allowing traffic to the internet.
    - Policies with any-any rules.
- F5 Firewall:
  - this module dumps all security policies, their status and all configured pools mapped with associated policies.
  - The findings tab must have four sections : 
    - Policies in learning mode.
    - Policies which are not OWASP compliance score 10/10.
    - Pools with no associated Security Policies.
