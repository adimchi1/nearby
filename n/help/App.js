import React, { Component } from 'react';
import { StyleSheet, Text, View, Button, Alert } from 'react-native';

import Pusher from 'pusher-js/react-native';
import RNGooglePlacePicker from 'react-native-google-place-picker';
import Geocoder from 'react-native-geocoding';
import MapView from 'react-native-maps';
import Spinner from 'react-native-loading-spinner-overlay';

import { regionFrom, getLatLonDiffInMeters } from './helpers';

Geocoder.setApiKey('google api key');

export default class App extends Component {

  state = {
    location: null,
    error: null,
    has_help: false,
    destination: null,
    helper: null,
    origin: null,
    is_searching: false,
    has_been_helped: false
  };

	constructor() {
  	super();
    this.username = 'wernancheta';
  	this.available_helpers_channel = null;
  	this.bookhelp = this.bookhelp.bind(this);
  	this.user_help_channel = null;
	}


  bookhelp() {

    RNGooglePlacePicker.show((response) => {
      if (response.didCancel) {
        console.log('User cancelled GooglePlacePicker');
      } else if (response.error) {
        console.log('GooglePlacePicker Error: ', response.error);
      } else {
        this.setState({
        	is_searching: true,
        	destination: response
        });

        let pickup_data = {
          name: this.state.origin.name,
          latitude: this.state.location.latitude,
          longitude: this.state.location.longitude
        };

        let dropoff_data = {
          name: response.name,
          latitude: response.latitude,
          longitude: response.longitude
        };

        this.available_helpers_channel.trigger('client-helper-request', {
          username: this.username,
          pickup: pickup_data,
          dropoff: dropoff_data
        });

      }
    });
  }


  _setCurrentLocation() {

  	navigator.geolocation.watchPosition(
      (position) => {
        var region = regionFrom(
          position.coords.latitude, 
          position.coords.longitude, 
          position.coords.accuracy
        );
        
        Geocoder.getFromLatLng(position.coords.latitude, position.coords.longitude).then(
          (json) => {
            var address_component = json.results[0].address_components[0];
            
            this.setState({
              origin: {
                name: address_component.long_name,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              },
              location: region,
              destination: null,
              has_help: false,
              has_been_helped: false,
              helper: null    
            });

          },
          (error) => {
            console.log('err geocoding: ', error);
          }
        );

      },
      (error) => this.setState({ error: error.message }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 3000 },
  	);

  }

  componentDidMount() {

    this._setCurrentLocation();

    var pusher = new Pusher('app id', {
      authEndpoint: 'auth server end point',
      cluster: '',
      encrypted: true
    });
    
    this.available_helpers_channel = pusher.subscribe('private-available-helpers');

    this.user_help_channel = pusher.subscribe('private-help-' + this.username);

    this.user_help_channel.bind('client-helper-response', (data) => {
    	
      let victim_response = 'no';
      if(!this.state.has_help){
        victim_response = 'yes';
      }

      // victim responds to helper's response
  		this.user_help_channel.trigger('client-helper-response', {
  			response: victim_response
  		});
    });

    this.user_help_channel.bind('client-found-helper', (data) => {
  		// found helper, the victim has no say about this.
  		// once a helper is found, this will be the helper that's going to take the user
  		// to their safe destination
  		let region = regionFrom(
  			data.location.latitude,
  			data.location.longitude,
  			data.location.accuracy 
  		);

  		this.setState({
  			has_help: true,
  			is_searching: false,
  			location: region,
  			helper: {
  			  latitude: data.location.latitude,
  			  longitude: data.location.longitude,
  			  accuracy: data.location.accuracy
  			}
  		});

  		Alert.alert(
  			"good news!",
  			"We found you help. \nName: " + data.helper.name + "\nCurrent location: " + data.location.name,
  			[
  			  {
  			    text: 'great!'
  			  },
  			],
  			{ cancelable: false }
  		);      

    });

    this.user_help_channel.bind('client-helper-location', (data) => {
      // helper location received
      let region = regionFrom(
        data.latitude,
        data.longitude,
        data.accuracy
      );

      this.setState({
        location: region,
        helper: {
          latitude: data.latitude,
          longitude: data.longitude
        }
      });

    });

    this.user_help_channel.bind('client-helper-message', (data) => {
    	if(data.type == 'near_pickup'){
    		//remove victim marker
    		this.setState({
    			has_been_helped: true
    		});
    	}

    	if(data.type == 'near_dropoff'){
    		this._setCurrentLocation();
    	}
    	
    	Alert.alert(
	        data.title,
	        data.msg,
	        [
	          {
	            text: 'Ok!'
	          },
	        ],
	        { cancelable: false }
      	);	
    });

  }

  render() {

    return (
      <View style={styles.container}>
      	<Spinner 
      		visible={this.state.is_searching} 
      		textContent={"Looking for help..."} 
      		textStyle={{color: '#FFF'}} />
        <View style={styles.header}>
          <Text style={styles.header_text}>GrabClone</Text>
        </View>
        {
          !this.state.has_help && 
          <View style={styles.form_container}>
            <Button
              onPress={this.bookhelp}
              title="ask for help"
              color="#103D50"
            />
          </View>
        }
        
        <View style={styles.map_container}>  
        {
          this.state.origin && this.state.destination &&
          <View style={styles.origin_destination}>
            <Text style={styles.label}>Origin: </Text>
            <Text style={styles.text}>{this.state.origin.name}</Text>
           
            <Text style={styles.label}>Destination: </Text>
            <Text style={styles.text}>{this.state.destination.name}</Text>
          </View>  
        }
        {
          this.state.location &&
          <MapView
            style={styles.map}
            region={this.state.location}
          >
            {
              this.state.origin && !this.state.has_been_helped &&
              <MapView.Marker
                coordinate={{
                latitude: this.state.origin.latitude, 
                longitude: this.state.origin.longitude}}
                title={"You're here"}
              />
            }
    
            {
              this.state.helper &&
              <MapView.Marker
                coordinate={{
                latitude: this.state.helper.latitude, 
                longitude: this.state.helper.longitude}}
                title={"Your help is here"}
                pinColor={"#4CDB00"}
              />
            }
          </MapView>
        }
        </View>
      </View>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end'
  },
  form_container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  header: {
    padding: 20,
    backgroundColor: '#333',
  },
  header_text: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold'
  },  
  origin_destination: {
    alignItems: 'center',
    padding: 10
  },
  label: {
    fontSize: 18
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  map_container: {
    flex: 9
  },
  map: {
   flex: 1
  },
});