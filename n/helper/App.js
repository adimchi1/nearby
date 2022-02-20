import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Alert
} from 'react-native';

import Pusher from 'pusher-js/react-native';
import MapView from 'react-native-maps';
import Geocoder from 'react-native-geocoding';

import { regionFrom, getLatLonDiffInMeters } from './helpers';

Geocoder.setApiKey('google cloud api key');

export default class grabhelper extends Component {
  state = {
    victim: null,
    region: null,
    accuracy: null,
    nearby_alert: false,
    has_victim: false,
    has_been_helped: false
  }

  constructor() {
    super();

    this.available_helpers_channel = null; 
    this.help_channel = null;    
    this.pusher = null;

    console.ignoredYellowBox = [
      'Setting a timer'
    ];
  }


  componentWillMount() {

    this.pusher = new Pusher('app id', {
      authEndpoint: 'auth server end point',
      cluster: 'pusher cluster',
      encrypted: true
    });

    this.available_helpers_channel = this.pusher.subscribe('private-available-helpers');

    this.available_helpers_channel.bind('client-helper-request', (victim_data) => {
      
      if(!this.state.has_victim){

        Alert.alert(
          "you got a user!",
          "help: " + victim_data.pickup.name + "\ntake to: " + victim_data.dropoff.name,
          [
            {
              text: "Later", 
              onPress: () => {
                console.log('Cancel Pressed');
              },
              style: 'cancel'
            },
            {
              text: 'Got  you!', 
              onPress: () => {
                
                this.help_channel = this.pusher.subscribe('private-help-' + victim_data.username);
                this.help_channel.bind('pusher:subscription_succeeded', () => {
                 
                  this.help_channel.trigger('client-helper-response', {
                    response: 'yes'
                  });

                  this.help_channel.bind('client-helper-response', (helper_response) => {
                    
                    if(helper_response.response == 'yes'){

                      this.setState({
                        has_victim: true,
                        victim: {
                          username: victim_data.username,
                          pickup: victim_data.pickup,
                          dropoff: victim_data.dropoff
                        }
                      });

                      Geocoder.getFromLatLng(this.state.region.latitude, this.state.region.longitude).then(
                        (json) => {
                          var address_component = json.results[0].address_components[0];
                          
                          this.help_channel.trigger('client-found-helper', { 
                            helper: {
                              name: 'John Smith'
                            },
                            location: {
                              name: address_component.long_name,
                              latitude: this.state.region.latitude,
                              longitude: this.state.region.longitude,
                              accuracy: this.state.accuracy
                            }
                          });

                        },
                        (error) => {
                          console.log('err geocoding: ', error);
                        }
                      );  

                    }else{
                      
                      Alert.alert(
                        "Too late !",
                        "someone else beat you to it",
                        [
                          {
                            text: 'Ok'
                          },
                        ],
                        { cancelable: false }
                      );
                    }

                  });

                });

              }
            },
          ],
          { cancelable: false }
        );
      }

    });
  }


  componentDidMount() {

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
       
        var region = regionFrom(
          position.coords.latitude, 
          position.coords.longitude, 
          position.coords.accuracy
        );
       
        this.setState({
          region: region,
          accuracy: position.coords.accuracy
        });

        if(this.state.has_victim && this.state.victim){
          
          var diff_in_meter_pickup = getLatLonDiffInMeters(
            position.coords.latitude, position.coords.longitude, 
            this.state.victim.pickup.latitude, this.state.victim.pickup.longitude);

          if(diff_in_meter_pickup <= 20){
            
            if(!this.state.has_been_helped){
              
              this.help_channel.trigger('client-helper-message', {
                type: 'near_user_location',
                title: 'Just a heads up',
                msg: 'Your help is nearby, make your presence known!'
              });

              this.setState({
                has_been_helped: true
              });

            }

          }else if(diff_in_meter_pickup <= 50){

            if(!this.state.nearby_alert){

              this.setState({
                nearby_alert: true
              });

              Alert.alert(
                "Slow down",
                "the user is just around the corner",
                [
                  {
                    text: 'Got you!'
                  },
                ],
                { cancelable: false }
              );

            }
          
          }

          var diff_in_meter_dropoff = getLatLonDiffInMeters(
            position.coords.latitude, position.coords.longitude, 
            this.state.victim.dropoff.latitude, this.state.victim.dropoff.longitude);

          if(diff_in_meter_dropoff <= 20){
            this.help_channel.trigger('client-helper-message', {
              type: 'near_safe_location',
              title: "get ready",
              msg: "You're very close to your destination."
            });

            this.help_channel.unbind('client-helper-response');
            this.pusher.unsubscribe('private-help-' + this.state.victim.username);

            this.setState({
              victim: null,
              has_victim: false,
              has_been_helped: false
            });

          }

          this.help_channel.trigger('client-helper-location', { 
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });

        }

      },
      (error) => this.setState({ error: error.message }),
      { 
        enableHighAccuracy: true, timeout: 20000, maximumAge: 1000, distanceFilter: 10 
      },
    );
  }


  componentWillUnmount() {
    navigator.geolocation.clearWatch(this.watchId);
  }


  render() {
    return (
      <View style={styles.container}>
        {
          this.state.region && 
          <MapView
            style={styles.map}
            region={this.state.region}
          >
              <MapView.Marker
                coordinate={{
                latitude: this.state.region.latitude, 
                longitude: this.state.region.longitude}}
                title={"You're here"}
              />
              
              {
                this.state.victim && !this.state.has_been_helped && 
                <MapView.Marker
                  coordinate={{
                  latitude: this.state.victim.pickup.latitude, 
                  longitude: this.state.victim.pickup.longitude}}
                  title={"the user is here"}
                  pinColor={"#4CDB00"}
                />
              }
          </MapView>
        }
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});