begin;

select plan(1);

select pass('The local pgTAP database test runner is available.');

select * from finish();

rollback;
