# Sesprout-Server Import Domains

## About
This script reads a csv filled with domains & its details located in /data/import/input.csv, and insert/update 
those domains details into database

## Instructions

1. **Create and edit required files**
    |  File |  Description |
    |---|---|
    | ``/data/import/input.csv``  |  Input file with import Domains and its details.

2. **To read the input.csv and insert new domains/update existing domains as "tumblr" domain type**
	
	##Run

	a)scripts/import_accounts.sh -I -t 'tumblr'  ---> for tumblr domains

		-I ====> "Insert" Flag

		-t ====> "domain type" Flag

	b)scripts/import_accounts.sh -I -t 'pbn'  ---> for pbn domains

		-I ====> "Insert" Flag

		-t ====> "domain type" Flag - after the flag mention whether this is pbn domains	

3. **To read the input.csv and update existing domains**

	##Run

	a)scripts/import_accounts.sh -u -t 'tumblr'   ----> for tumblr domains

	b)scripts/import_accounts.sh -u -t 'pbn'      ----> for pbn domains


4. **To read the input.csv and Remove all domains that are not purchased**

    ##Run

	a)scripts/import_accounts.sh -r

5. **To read the input.csv and update deleted accounts**

    ##Run

	a)scripts/import_accounts.sh -D


   ## Import
   After the import is finished, all new/existing domain changes added/updated in DB

