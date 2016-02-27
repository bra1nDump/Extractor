//
//  ServerManager.swift
//  Extractor
//
//  Created by Кирилл on 2/27/16.
//  Copyright © 2016 BrainDump. All rights reserved.
//

import Foundation
import Parse

class ServerManager {
    typealias TextResponseBlock = (error: NSError?, text: String?) -> Void
    typealias SuccessResponceBlock = (success: Bool) -> Void

    private static var parentNode: Node?
    
    class func pull(handler: TextResponseBlock) {
        PFCloud.callFunctionInBackground("pull", withParameters: nil, block: {
            (data, error) -> Void in
            if error != nil {
                print("pull was not successfull. Error: ", error)
                
                handler(error: error, text: nil)
                return
            }
            
            if let nodes = data as? [Node] {
                print(nodes)
                
                self.parentNode = nodes.last
                
                var textFromNodes = ""
                for node in nodes {
                    textFromNodes += node.content + " "
                }
                
                handler(error: nil, text: textFromNodes)
            }
        })
    }
    
    class func push(data: String, handler: SuccessResponceBlock) {
        let newNode = Node()
        newNode.parent   = parentNode
        newNode.children = []
        newNode.depth    = parentNode != nil ? parentNode!.depth + 1 : 0
        
        newNode.rating           = 0
        newNode.reservedChildren = 0

        newNode.owner   = PFUser.currentUser()!
        newNode.content = data
        
        newNode.saveInBackgroundWithBlock({
            (success, error) -> Void in
            if error != nil {
                print("Error occured while saving new node. Error: ", error)
                return
            }
            
            print("Node saved: ", newNode)
            
            handler(success: true)
        })
    }
    
    class func reject(handler: SuccessResponceBlock) {
        if parentNode == nil {
            handler(success: true)
            return
        }
        
        let parameters = [
            "objectId": parentNode!.objectId!
        ]
        PFCloud.callFunctionInBackground("reject", withParameters: parameters)
        handler(success: true)
    }
    
    
    
    
    
    

}
