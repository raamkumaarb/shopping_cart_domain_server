# Sesprout-Server Export Domains

## About
This script reads a domains from database & generate a csv file in /tmp/tumblr_exports/ with all the domain details.

## Instructions

1. **Export all the domains from DB and generate a csv file**
	
	##Run

	a)scripts/export_accounts.sh -E -t 'tumblr'  ---> export only tumblr domains

		-I ====> "Export" Flag

		-t ====> "domain type" Flag

	b)scripts/export_accounts.sh -E -t 'pbn'  ---> export only pbn domains

		-I ====> "Export" Flag

		-t ====> "domain type" Flag 	

   ## Export
   After the export is finished, find exported csv file in /tmp/tumblr_exports/ path

