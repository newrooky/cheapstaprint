<?php
/* ====================== INFO ========================
Frame: 							340 x 510
Instagram size:				306 x 306
Footer Picture size:	  	340x140
====================================================*/ 

// ================== CONFIGURATION ===================
$loop=FALSE;  																	// ==== The script will run forever
if ($loop) set_time_limit(0);   											// ~ No time execution limit
	else error_reporting(0);												// ~ No error displaying on web browser
	
$tag="";																				// ==== Tag to search with															
$searchByLocation=FALSE;											// Locations ---> Get LAT, LNG ---> query Instagram API
$searchByLocation_ID=TRUE;										// NOTE: If $searchByLocation == TRUE then this value is ignored
$footer_picture_name="creature_london";		// File type must be JPG
$font = 'Fonts/GeosansLight.ttf';		

$footerDir="Footer_Pictures/";
$srcDir="Original_Instagram_Pictures/";							// ==== Path to Folder which stores original pictures from Instagram
$dstDir="Completed_Pictures/london";										// ==== Path to Folder which stores the final pictures after combining	
$interval=30;           															// ==== Interval time (in seconds) - should be >= 20

$clientId="INSERT YOUR INSTAGRAM CLIENTID";		// ==== Instagram Client ID (need to register with Instagram to get it)
if ($tag==""){
	$tag=$_GET['tag'];															// ~ If there is no tag value here then get it from Web browser
	$searchByLocation=$_GET['searchByLocation'];
	$searchByLocation_ID=$_GET['searchByLocation_ID'];
}


//====================================================

if (!$tag){ ?>	
	<form>
		Search and Generate images with Tag: <input name="tag"/>
		<br><input type="checkbox" name="searchByLocation"/> Search By Location
		<br><input type="checkbox" name="searchByLocation_ID"/> Search By Location ID (If Search By Location is checked. This will be ignored)
		<br><input type="submit" value="Generate"/>
	</form>
<? } else {
	while (TRUE){
		// GET THE URL
		$url="https://api.instagram.com/v1/tags/".$tag."/media/recent?client_id=".$clientId; // SEARCH BY TAGS - Instagram API tags endpoint
		if ($searchByLocation){
			$geoCodingUrl="http://maps.google.com/maps/api/geocode/json?address=".$tag."&sensor=false";
			$json=file_get_contents($geoCodingUrl);
			$geoCodingContent=json_decode($json);
			$lat=$geoCodingContent->results[0]->geometry->location->lat;
			$lng=$geoCodingContent->results[0]->geometry->location->lng;
			if ((!$lat)||(!$lng)) die ("<br>WRONG LOCATION ! WE CANNOT GET LATITUDE AND LONGITUDE FOR THIS !");				
			$url="https://api.instagram.com/v1/media/search?lat=".$lat."&lng=".$lng."&client_id=".$clientId;				
		} else if ($searchByLocation_ID){
			$url="https://api.instagram.com/v1/locations/".$tag."/media/recent?client_id=".$clientId;			
		}			
		
		// GET 4 IMAGES FROM ABOVE URL:
		$jsonContent=file_get_contents($url);
		$content = json_decode($jsonContent);
		
		$imgArr=array();
			$realImageArray=array();
		$userArr=array();
		$avatarArr=array();
			$realAvatarArray=array();
		$timeArr=array();
		for ($i=0;$i<4;$i++){
			$imgArr[]=$content->data[$i]->images->low_resolution->url;		
			$userArr[]=$content->data[$i]->user->username;
			$avatarArr[]=$content->data[$i]->user->profile_picture;
				 $tmpAvatarWithoutResize=imagecreatefromstring(file_get_contents($avatarArr[$i])); 
				 $resize_image = imagecreatetruecolor(30, 30);
				 imagecopyresampled($resize_image, $tmpAvatarWithoutResize, 0, 0, 0, 0, 30, 30, 150, 150);
				$realAvatarArray[] =$resize_image;
			$UnixTime=$content->data[$i]->caption->created_time;
			$timeArr[]=date('Y-m-d', $UnixTime);			
		}		
		
		// CHECK IF IMAGE EXISTENT -- AND CREATE IMAGE OBJECT OF INSTAGRAM PICTURES
		$oldImageNameArray = glob($srcDir . "*.jpg"); 
		for ($i=0;$i<count($imgArr);$i++){
			$existent=FALSE;
			$newMd5=md5($imgArr[$i]);		
			foreach($oldImageNameArray as $oldMd5){
				$oldMd5=substr($oldMd5,strpos($oldMd5,"/")+1);
				$oldMd5=substr($oldMd5,0,strpos($oldMd5,"."));
				if ($oldMd5==$newMd5){
					$existent=TRUE;				
					break;
				}
			}
			if ($existent){								
				$realImageArray[$i] = imagecreatefromjpeg($srcDir."/".$newMd5.".jpg");
			} else {
				$realImageArray[$i] = imagecreatefromstring(file_get_contents($imgArr[$i])); 			
				imagejpeg($realImageArray[$i], $srcDir."/".$newMd5.'.jpg');
			}		
		}
	

		// ==================== CREATE IMAGE FILES ==================	
		$originFrame = imagecreatefromstring(file_get_contents("frame.jpg"));		

		for ($i=0;$i<4;$i++){
			$frame=$originFrame; 			// Clone new frame
			
			// INSERT INSTAGRAM		
			imagecopymerge($frame, $realImageArray[$i], 17, 60, 0, 0, 306, 306, 100); //Params =(background img, img upper, BG x, BG y, Upper X-Y-W-H, alpha)
			
			// INSER USERNAME			
			$username_img = imagecreatetruecolor(200, 30);				
			$white = imagecolorallocate($username_img, 255, 255, 255);
			$grey = imagecolorallocate($username_img, 128, 128, 128);
			$black = imagecolorallocate($username_img, 0, 0, 0);
			$blue = imagecolorallocate($username_img, 54, 35, 147);
			imagefilledrectangle($username_img, 0, 0, 200, 30, $white);
			$text = $userArr[$i];		
			// imagettftext($username_img, 14, 0, 11, 21, $white, $font, $text); // Add some shadow to the text. IMG - SIZE -ANGLE - X - Y - COLOR- FONT - CONTENT
			imagettftext($username_img, 17, 0, 10, 20, $black, $font, $text); // Add the text		
			imagecopymerge($frame, $username_img, 40, 22, 0, 0, 200, 25, 100);
			
			// INSERT TIME STAMP
			$time_img=imagecreatetruecolor(90, 30);
			imagefilledrectangle($time_img, 0, 0, 90, 30, $white);
			$time=$timeArr[$i];
			imagettftext($time_img, 11, 0, 11, 21, $black, $font, $time); // Add the text		
			imagecopymerge($frame, $time_img, 245, 22, 0, 0, 90, 25, 100);
			
			// INSERT AVATAR
			imagecopymerge($frame, $realAvatarArray[$i], 17, 16, 0, 0, 30, 30, 100); 
			
			// INSERT FOOTER PICTURE
			$footer_pictures=imagecreatefromjpeg($footerDir.$footer_picture_name.".jpg");
			imagecopymerge($frame, $footer_pictures, 0, 370, 0, 0, 340, 140, 100); 
			
			 # Save the image to a file
			imagejpeg($frame, $dstDir."/".md5($imgArr[$i]).".jpg");
		}
		if (!$loop) break;
			else sleep($interval);
	}
	
	// =========== OUTPUT TO WEB BROWSER ============
	echo "<table bgcolor='#ccc'><tr>";
	for ($i=0;$i<4;$i++)
		echo "<td><img src='".$dstDir."/".md5($imgArr[$i]).".jpg"."'/></td>";	
	echo "</tr></table>";
	
	 # Output straight to the browser.
	 //imagepng($image);
}