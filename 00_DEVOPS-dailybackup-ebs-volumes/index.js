/**
 * Purpose: 
 * (1) Provide AWS SDLC resources(Artifacory, Jira/Confluence/Bitbucket)
 * EBS volume backup functions if the volume is tagged with 'backup:true'
 * (2) Housekeeping of snapshots exist more than retention date
 * 
 * Author: Yuming Peng
 * Create date: 2018/12/19
 * 
 */

// Load the SDK and UUID
var dateFormat = require('dateformat');
var AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {
  AWS.config.update({region: 'us-east-1'});
  var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

  // +++++ main flow +++++
  startSnapshotCleanupProcess();
  startVolumeBackup2SnapshotProcess();

  // +++++ supporting functions +++++

  /**
   * Start Backup for EBS Volumes with tag backup:'true'
   */
  function startVolumeBackup2SnapshotProcess(){
    //create filter 
    var params = {    
      Filters: [
      {
          Name: 'tag:backup',
          Values: ['true'],
      }, ] 
    };
    
    //filter the EBS volumes has tag backup:'true'
    ec2.describeVolumes(params, function(err, data) {
      if (err) 
        console.log(err, err.stack); // an error occurred
      
      var volumes = data.Volumes;  
      for(var i = 0; i < volumes.length; i++) {
        var volID   = volumes[i].VolumeId;
        var tags    = volumes[i].Tags;
        var volName = (tags.find(({ Key }) => Key === 'Name') || {}).Value;
        
        //create snapshot for each matching VolumentID, volName is used for snapshot naming
        createSnapshotForVolume(volID, volName);
      }
    
    }); 
  }

  /**
   * Create snapshot for specified volID, 
   * @param {*} volID 
   * @param {*} volName 
   */
  function createSnapshotForVolume(volID,volName){
    var description = volName+"-"+dateFormat("isoDate");
    var params = {
      Description: description, 
      VolumeId: volID,
      TagSpecifications:[
        {
          ResourceType: "snapshot",
          Tags: [
            { Key: 'Name', Value: 'SDLC-backup' },
          ],
        },
      ]
    };

    ec2.createSnapshot(params, function(err, data) {
      if (err) console.log(err, err.stack); // an error occurred

      console.log('Create snapshot for volume:'+volID);
    });
    
  }

  /**
   * Start housekeeping for snapshots with tag Name:'SDLC-backup' and
   * snapshots is older than RETENTION_DAYS
   */
  function startSnapshotCleanupProcess(){
    
    const RETENTION_DAYS = 14;
    //create filter that extract resources require cleanup
    var params = {
      Filters: [
        {
            Name: 'tag:Name',
            Values: ['SDLC-backup'],
        }, ] 
    };
    
    ec2.describeSnapshots(params, function(err, data) {
      if (err) console.log(err, err.stack); // an error occurred

      var snapshots = data.Snapshots;  
      for(var i = 0; i < snapshots.length; i++) {
        var snapshotID = snapshots[i].SnapshotId;
        var snapshotDTM = snapshots[i].StartTime;

        //check date 
        var expire_date = new Date();
        expire_date.setDate(expire_date.getDate()-RETENTION_DAYS);
        var snapshotdate = new Date(snapshotDTM);
      
        if (snapshotdate < expire_date){
          var difference = expire_date - snapshotdate; // difference in milliseconds
          console.log("SnapshotID:"+snapshotID+" is expired for "+Math.round(difference/1000/60)+" mins.");
          deleteSnapshots(snapshotID);
        }else{
          console.log("SnapshotID:"+snapshotID+" is within "+RETENTION_DAYS+" retention days.");
        }
      }
    });
  }


  function deleteSnapshots(snapshotid){
    var params = {
      SnapshotId: snapshotid
    };
    console.log('Delete snapshots:'+snapshotid);
      ec2.deleteSnapshot(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        //else     console.log(data);           // successful response
      });   
  }
};